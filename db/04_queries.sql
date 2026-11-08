-- =====================================================================
-- 04_queries.sql — примеры запросов: вставка, обновление, выборка, удаление
-- (параметры $1, $2… — как в node-postgres / Prisma raw)
-- =====================================================================

-- ---------- INSERT ----------
-- регистрация арендатора
INSERT INTO users (email, password_hash, full_name, phone) VALUES ($1, $2, $3, $4) RETURNING id;

-- создание помещения владельцем
INSERT INTO rooms (owner_id, category_id, title, description, address, area_m2, capacity, price_per_hour, price_per_day)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id;

-- создание аренды (цена и проверки — в триггере; при пересечении вернётся ошибка bookings_no_overlap)
INSERT INTO bookings (room_id, tenant_id, start_at, end_at, comment) VALUES ($1, $2, $3, $4, $5) RETURNING id, total_price;

-- отзыв о помещении
INSERT INTO reviews (booking_id, room_id, tenant_id, rating, comment) VALUES ($1, $2, $3, $4, $5);

-- запись в чёрный список (бессрочный бан от администратора)
INSERT INTO blacklist_entries (tenant_id, owner_id, entry_type, reason, created_by) VALUES ($1, NULL, 'ban', $2, $3);

-- ---------- UPDATE ----------
UPDATE rooms SET price_per_hour = $2, price_per_day = $3 WHERE id = $1 AND owner_id = $4;     -- владелец меняет цену
SELECT fn_cancel_booking($1, $2);                                                              -- отмена аренды
SELECT fn_complete_booking($1, now());                                                         -- приём помещения, расчёт штрафа
UPDATE penalties SET status = 'paid' WHERE id = $1 AND status = 'unpaid';                      -- штраф оплачен
UPDATE blacklist_entries SET revoked_at = now(), revoked_by = $2 WHERE id = $1 AND revoked_at IS NULL; -- снятие бана
UPDATE users SET status = 'active' WHERE id = $1;

-- ---------- SELECT ----------
-- каталог: свободные в период помещения с фильтрами, ценой, рейтингом и главным фото
SELECT r.id, r.title, r.address, r.capacity, r.price_per_hour, c.name AS category,
       p.url AS main_photo, rr.avg_rating, rr.reviews_count
  FROM rooms r
  JOIN room_categories c  ON c.id = r.category_id
  LEFT JOIN room_photos p ON p.room_id = r.id AND p.is_main
  LEFT JOIN v_room_rating rr ON rr.room_id = r.id
 WHERE r.is_active
   AND ($1::bigint IS NULL OR r.category_id = $1)
   AND ($2::numeric IS NULL OR r.price_per_hour >= $2)
   AND ($3::numeric IS NULL OR r.price_per_hour <= $3)
   AND ($4::int IS NULL OR r.capacity >= $4)
   AND ($5::timestamptz IS NULL OR fn_room_is_free(r.id, $5, $6))
 ORDER BY r.price_per_hour
 LIMIT 20 OFFSET $7;

-- календарь занятости помещения на месяц
SELECT * FROM fn_room_busy_slots($1, $2, $3);

-- мои аренды арендатора с фильтром по статусу
SELECT b.id, r.title, b.start_at, b.end_at, b.status, b.total_price
  FROM bookings b JOIN rooms r ON r.id = b.room_id
 WHERE b.tenant_id = $1 AND ($2::booking_status IS NULL OR b.status = $2)
 ORDER BY b.start_at DESC;

-- аренды помещений владельца (для его кабинета)
SELECT b.id, r.title, u.full_name AS tenant, b.start_at, b.end_at, b.status
  FROM bookings b JOIN rooms r ON r.id = b.room_id JOIN users u ON u.id = b.tenant_id
 WHERE r.owner_id = $1 ORDER BY b.start_at DESC;

-- карточка арендатора (информация о клиенте + рейтинг + чёрный список)
SELECT * FROM v_tenant_stats WHERE tenant_id = $1;

-- отзывы о помещении
SELECT rv.rating, rv.comment, rv.created_at, u.full_name
  FROM reviews rv JOIN users u ON u.id = rv.tenant_id
 WHERE rv.room_id = $1 ORDER BY rv.created_at DESC;

-- аналитика владельца: выручка и загрузка по помещениям за месяц
SELECT r.title,
       COUNT(*) FILTER (WHERE b.status = 'completed')                  AS completed,
       COALESCE(SUM(b.total_price) FILTER (WHERE b.status = 'completed'), 0) AS revenue,
       ROUND(SUM(EXTRACT(EPOCH FROM (b.end_at - b.start_at)) / 3600)
             FILTER (WHERE b.status IN ('completed', 'active')), 1)    AS busy_hours
  FROM rooms r LEFT JOIN bookings b ON b.room_id = r.id
   AND b.start_at >= date_trunc('month', $2::date) AND b.start_at < date_trunc('month', $2::date) + interval '1 month'
 WHERE r.owner_id = $1 GROUP BY r.id ORDER BY revenue DESC;

-- «чёрный список»: действующие записи
SELECT b.*, u.full_name FROM blacklist_entries b JOIN users u ON u.id = b.tenant_id
 WHERE b.revoked_at IS NULL AND (b.expires_at IS NULL OR b.expires_at > now());

-- ---------- DELETE ----------
DELETE FROM room_photos WHERE id = $1 AND room_id = $2;
DELETE FROM room_blocks WHERE id = $1 AND room_id = $2;
DELETE FROM refresh_tokens WHERE expires_at < now() OR revoked_at IS NOT NULL;  -- чистка протухших токенов (cron)
-- Помещения и аренды физически не удаляются (история, отзывы): помещение деактивируется
UPDATE rooms SET is_active = FALSE WHERE id = $1 AND owner_id = $2;
