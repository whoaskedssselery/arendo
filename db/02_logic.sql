-- =====================================================================
-- 02_logic.sql — бизнес-правила в БД: триггеры, функции, представления
-- =====================================================================

-- ---------- updated_at ----------
CREATE FUNCTION trg_set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END $$;

CREATE TRIGGER users_updated    BEFORE UPDATE ON users    FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
CREATE TRIGGER rooms_updated    BEFORE UPDATE ON rooms    FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
CREATE TRIGGER bookings_updated BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- ---------- Проверка: действует ли бан/запись чёрного списка ----------
CREATE FUNCTION fn_is_blacklisted(p_tenant BIGINT, p_owner BIGINT) RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (
        SELECT 1 FROM blacklist_entries b
        WHERE b.tenant_id = p_tenant
          AND b.entry_type = 'ban'
          AND b.revoked_at IS NULL
          AND (b.expires_at IS NULL OR b.expires_at > now())
          AND (b.owner_id IS NULL OR b.owner_id = p_owner)
    ) OR EXISTS (SELECT 1 FROM users u WHERE u.id = p_tenant AND u.status = 'banned');
$$;

-- ---------- Стоимость аренды ----------
-- Почасовой тариф; если задан дневной — берём более выгодную для клиента цену.
CREATE FUNCTION fn_calc_price(p_room BIGINT, p_start TIMESTAMPTZ, p_end TIMESTAMPTZ) RETURNS NUMERIC
LANGUAGE plpgsql STABLE AS $$
DECLARE
    r rooms%ROWTYPE;
    hours INTEGER;
    hourly NUMERIC;
BEGIN
    SELECT * INTO r FROM rooms WHERE id = p_room;
    hours  := CEIL(EXTRACT(EPOCH FROM (p_end - p_start)) / 3600.0);
    hourly := hours * r.price_per_hour;
    IF r.price_per_day IS NOT NULL THEN
        RETURN LEAST(hourly, CEIL(hours / 24.0) * r.price_per_day);
    END IF;
    RETURN hourly;
END $$;

-- ---------- Проверки при создании аренды ----------
CREATE FUNCTION trg_bookings_before_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_owner  BIGINT;
    v_active BOOLEAN;
    v_role   user_role;
BEGIN
    IF NEW.end_at <= NEW.start_at THEN
        RAISE EXCEPTION 'Дата окончания должна быть позже даты начала' USING ERRCODE = 'P0001';
    END IF;
    SELECT owner_id, is_active INTO v_owner, v_active FROM rooms WHERE id = NEW.room_id;
    SELECT role INTO v_role FROM users WHERE id = NEW.tenant_id;

    IF NOT v_active THEN
        RAISE EXCEPTION 'Помещение недоступно для аренды' USING ERRCODE = 'P0001';
    END IF;
    IF v_owner = NEW.tenant_id THEN
        RAISE EXCEPTION 'Нельзя арендовать собственное помещение' USING ERRCODE = 'P0001';
    END IF;
    IF v_role <> 'tenant' THEN
        RAISE EXCEPTION 'Арендовать помещения могут только арендаторы' USING ERRCODE = 'P0001';
    END IF;
    IF fn_is_blacklisted(NEW.tenant_id, v_owner) THEN
        RAISE EXCEPTION 'Арендатор находится в чёрном списке' USING ERRCODE = 'P0001';
    END IF;
    -- Новые «живые» брони нельзя создавать в прошлом (исторические импортируются сразу как completed/cancelled)
    IF NEW.status = 'pending' AND NEW.start_at < now() - interval '5 minutes' THEN
        RAISE EXCEPTION 'Нельзя арендовать помещение в прошлом' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (SELECT 1 FROM room_blocks b
               WHERE b.room_id = NEW.room_id
                 AND tstzrange(b.start_at, b.end_at) && tstzrange(NEW.start_at, NEW.end_at)) THEN
        RAISE EXCEPTION 'Помещение закрыто владельцем на выбранный период' USING ERRCODE = 'P0001';
    END IF;

    NEW.total_price := fn_calc_price(NEW.room_id, NEW.start_at, NEW.end_at);
    RETURN NEW;
END $$;

CREATE TRIGGER bookings_before_insert BEFORE INSERT ON bookings
    FOR EACH ROW EXECUTE FUNCTION trg_bookings_before_insert();

-- ---------- Допустимые переходы статусов ----------
--   pending   -> active | cancelled
--   active    -> completed | cancelled
--   completed -> (нельзя ничего)       cancelled -> (нельзя ничего)
CREATE FUNCTION trg_bookings_status_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = OLD.status THEN
        RETURN NEW;
    END IF;
    IF OLD.status = 'completed' THEN
        RAISE EXCEPTION 'Нельзя изменить статус завершённой аренды' USING ERRCODE = 'P0001';
    END IF;
    IF OLD.status = 'cancelled' THEN
        RAISE EXCEPTION 'Нельзя изменить статус отменённой аренды' USING ERRCODE = 'P0001';
    END IF;
    IF OLD.status = 'pending' AND NEW.status = 'active' AND NEW.start_at > now() THEN
        RAISE EXCEPTION 'Аренда ещё не началась' USING ERRCODE = 'P0001';
    END IF;
    IF OLD.status = 'pending' AND NEW.status = 'completed' THEN
        RAISE EXCEPTION 'Нельзя завершить аренду, которая не начиналась' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.status = 'cancelled' AND NEW.cancelled_at IS NULL THEN
        NEW.cancelled_at := now();
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER bookings_status_guard BEFORE UPDATE OF status ON bookings
    FOR EACH ROW EXECUTE FUNCTION trg_bookings_status_guard();

-- ---------- Дата/время в завершённой аренде менять нельзя ----------
CREATE FUNCTION trg_bookings_freeze_closed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.status IN ('completed', 'cancelled')
       AND (NEW.start_at, NEW.end_at, NEW.room_id, NEW.tenant_id, NEW.total_price)
           IS DISTINCT FROM (OLD.start_at, OLD.end_at, OLD.room_id, OLD.tenant_id, OLD.total_price) THEN
        RAISE EXCEPTION 'Закрытую аренду редактировать нельзя' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER bookings_freeze_closed BEFORE UPDATE ON bookings
    FOR EACH ROW EXECUTE FUNCTION trg_bookings_freeze_closed();

-- ---------- История статусов ----------
CREATE FUNCTION trg_bookings_history() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_user BIGINT := NULLIF(current_setting('arendo.user_id', true), '')::BIGINT; -- выставляет бэкенд: SET LOCAL arendo.user_id = '42'
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO booking_status_history (booking_id, old_status, new_status, changed_by)
        VALUES (NEW.id, NULL, NEW.status, v_user);
    ELSIF NEW.status <> OLD.status THEN
        INSERT INTO booking_status_history (booking_id, old_status, new_status, changed_by, note)
        VALUES (NEW.id, OLD.status, NEW.status, v_user, NEW.cancel_reason);
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER bookings_history AFTER INSERT OR UPDATE OF status ON bookings
    FOR EACH ROW EXECUTE FUNCTION trg_bookings_history();

-- ---------- Блокировка помещения не должна пересекаться с бронями ----------
CREATE FUNCTION trg_room_blocks_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM bookings b
               WHERE b.room_id = NEW.room_id AND b.status IN ('pending', 'active')
                 AND tstzrange(b.start_at, b.end_at) && tstzrange(NEW.start_at, NEW.end_at)) THEN
        RAISE EXCEPTION 'На этот период уже есть аренда' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER room_blocks_check BEFORE INSERT OR UPDATE ON room_blocks
    FOR EACH ROW EXECUTE FUNCTION trg_room_blocks_check();

-- ---------- Отзывы: только по завершённой аренде ----------
CREATE FUNCTION trg_reviews_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM bookings WHERE id = NEW.booking_id AND status = 'completed') THEN
        RAISE EXCEPTION 'Отзыв можно оставить только по завершённой аренде' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END $$;

CREATE FUNCTION trg_tenant_reviews_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM bookings WHERE id = NEW.booking_id AND status = 'completed') THEN
        RAISE EXCEPTION 'Отзыв можно оставить только по завершённой аренде' USING ERRCODE = 'P0001';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM bookings b JOIN rooms r ON r.id = b.room_id
                   WHERE b.id = NEW.booking_id AND r.owner_id = NEW.owner_id) THEN
        RAISE EXCEPTION 'Оценить арендатора может только владелец помещения' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER reviews_check        BEFORE INSERT ON reviews        FOR EACH ROW EXECUTE FUNCTION trg_reviews_check();
CREATE TRIGGER tenant_reviews_check BEFORE INSERT ON tenant_reviews FOR EACH ROW EXECUTE FUNCTION trg_tenant_reviews_check();

-- =====================================================================
-- Функции-операции (вызываются бэкендом / планировщиком)
-- =====================================================================

-- Отмена аренды. Завершённую отменить нельзя (защищает trg_bookings_status_guard).
CREATE FUNCTION fn_cancel_booking(p_booking BIGINT, p_reason TEXT DEFAULT NULL) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE bookings
       SET status = 'cancelled', cancelled_at = now(), cancel_reason = LEFT(p_reason, 255)
     WHERE id = p_booking;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Аренда % не найдена', p_booking USING ERRCODE = 'P0002';
    END IF;
END $$;

-- Завершение аренды с фиксацией фактического возврата.
-- Просрочка > 15 минут → штраф (1.5 × почасовая ставка за каждый начатый час).
-- 3 просрочки подряд → автоматический бан. Возвращает сумму штрафа (0 — без штрафа).
CREATE FUNCTION fn_complete_booking(p_booking BIGINT, p_returned_at TIMESTAMPTZ DEFAULT now()) RETURNS NUMERIC
LANGUAGE plpgsql AS $$
DECLARE
    b          bookings%ROWTYPE;
    v_rate     NUMERIC;
    v_hours    INTEGER;
    v_penalty  NUMERIC := 0;
    v_late_cnt INTEGER;
    v_owner    BIGINT;
BEGIN
    SELECT * INTO b FROM bookings WHERE id = p_booking FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Аренда % не найдена', p_booking USING ERRCODE = 'P0002';
    END IF;

    UPDATE bookings SET status = 'completed', actual_return_at = p_returned_at WHERE id = p_booking;

    IF p_returned_at > b.end_at + interval '15 minutes' THEN
        SELECT price_per_hour, owner_id INTO v_rate, v_owner FROM rooms WHERE id = b.room_id;
        v_hours   := CEIL(EXTRACT(EPOCH FROM (p_returned_at - b.end_at)) / 3600.0);
        v_penalty := ROUND(v_hours * v_rate * 1.5, 2);
        INSERT INTO penalties (booking_id, reason, amount, note)
        VALUES (p_booking, 'late_return', v_penalty, 'Просрочка возврата, часов: ' || v_hours);

        SELECT COUNT(*) INTO v_late_cnt
          FROM penalties p JOIN bookings bb ON bb.id = p.booking_id
         WHERE bb.tenant_id = b.tenant_id AND p.reason = 'late_return';

        IF v_late_cnt >= 3 AND NOT fn_is_blacklisted(b.tenant_id, NULL) THEN
            INSERT INTO blacklist_entries (tenant_id, owner_id, entry_type, reason, booking_id)
            VALUES (b.tenant_id, NULL, 'ban', 'Автоматический бан: 3 и более просрочек возврата', p_booking);
            UPDATE users SET status = 'banned' WHERE id = b.tenant_id;
        ELSIF v_late_cnt = 2 THEN
            INSERT INTO blacklist_entries (tenant_id, owner_id, entry_type, reason, booking_id)
            VALUES (b.tenant_id, NULL, 'warning', 'Предупреждение: 2 просрочки возврата', p_booking);
        END IF;
    END IF;
    RETURN v_penalty;
END $$;

-- Планировщик (cron, раз в минуту): ожидающие аренды, время которых наступило, становятся активными.
-- Возвращает количество переведённых аренд.
CREATE FUNCTION fn_sync_booking_statuses() RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE bookings SET status = 'active'
     WHERE status = 'pending' AND start_at <= now();
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END $$;

-- Занятые интервалы помещения за период (для календаря занятости).
CREATE FUNCTION fn_room_busy_slots(p_room BIGINT, p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE (kind TEXT, start_at TIMESTAMPTZ, end_at TIMESTAMPTZ, status TEXT)
LANGUAGE sql STABLE AS $$
    SELECT 'booking', b.start_at, b.end_at, b.status::TEXT
      FROM bookings b
     WHERE b.room_id = p_room AND b.status IN ('pending', 'active')
       AND tstzrange(b.start_at, b.end_at) && tstzrange(p_from, p_to)
    UNION ALL
    SELECT 'block', k.start_at, k.end_at, 'blocked'
      FROM room_blocks k
     WHERE k.room_id = p_room
       AND tstzrange(k.start_at, k.end_at) && tstzrange(p_from, p_to)
    ORDER BY 2;
$$;

-- Свободно ли помещение на период.
CREATE FUNCTION fn_room_is_free(p_room BIGINT, p_from TIMESTAMPTZ, p_to TIMESTAMPTZ) RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
    SELECT NOT EXISTS (SELECT 1 FROM fn_room_busy_slots(p_room, p_from, p_to));
$$;

-- =====================================================================
-- Представления
-- =====================================================================

-- Рейтинг помещений
CREATE VIEW v_room_rating AS
SELECT r.id AS room_id,
       ROUND(AVG(rv.rating), 2) AS avg_rating,
       COUNT(rv.id)             AS reviews_count
  FROM rooms r LEFT JOIN reviews rv ON rv.room_id = r.id
 GROUP BY r.id;

-- Карточка арендатора для владельца: статистика + общий рейтинг + статус в чёрном списке
CREATE VIEW v_tenant_stats AS
SELECT u.id AS tenant_id,
       u.full_name,
       u.status AS user_status,
       COUNT(b.id)                                         AS bookings_total,
       COUNT(b.id) FILTER (WHERE b.status = 'completed')   AS completed_count,
       COUNT(b.id) FILTER (WHERE b.status = 'cancelled')   AS cancelled_count,
       (SELECT COUNT(*) FROM penalties p JOIN bookings bb ON bb.id = p.booking_id
         WHERE bb.tenant_id = u.id AND p.reason = 'late_return')           AS late_returns,
       (SELECT COALESCE(SUM(p.amount), 0) FROM penalties p JOIN bookings bb ON bb.id = p.booking_id
         WHERE bb.tenant_id = u.id AND p.status = 'unpaid')                AS unpaid_penalties,
       (SELECT ROUND(AVG(t.rating), 2) FROM tenant_reviews t WHERE t.tenant_id = u.id) AS avg_rating,
       fn_is_blacklisted(u.id, NULL)                       AS is_blacklisted
  FROM users u LEFT JOIN bookings b ON b.tenant_id = u.id
 WHERE u.role = 'tenant'
 GROUP BY u.id;
