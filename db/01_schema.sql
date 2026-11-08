-- =====================================================================
-- Arendo: аренда помещений на определённый период
-- СУБД: PostgreSQL 15+
-- 01_schema.sql — типы, таблицы, ограничения, индексы
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;   -- для EXCLUDE (запрет пересечения броней)

-- ---------------------------------------------------------------------
-- Типы-перечисления
-- ---------------------------------------------------------------------
CREATE TYPE user_role      AS ENUM ('tenant', 'owner', 'admin');
CREATE TYPE user_status    AS ENUM ('active', 'banned');
CREATE TYPE booking_status AS ENUM ('pending', 'active', 'completed', 'cancelled'); -- Ожидает, Активно, Завершено, Отменено
CREATE TYPE penalty_reason AS ENUM ('late_return', 'damage', 'other');
CREATE TYPE penalty_status AS ENUM ('unpaid', 'paid', 'waived');
CREATE TYPE blacklist_type AS ENUM ('warning', 'ban');

-- ---------------------------------------------------------------------
-- Пользователи
-- ---------------------------------------------------------------------
CREATE TABLE users (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email         VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,                 -- bcrypt/argon2, пароль в открытом виде не хранится
    full_name     VARCHAR(150) NOT NULL,
    phone         VARCHAR(20),
    role          user_role   NOT NULL DEFAULT 'tenant',
    status        user_status NOT NULL DEFAULT 'active',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT users_email_format CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    CONSTRAINT users_phone_format CHECK (phone IS NULL OR phone ~ '^\+?[0-9]{10,15}$')
);
CREATE UNIQUE INDEX users_email_uq ON users (lower(email));

CREATE TABLE refresh_tokens (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(128) NOT NULL UNIQUE,            -- хранится хэш токена, не сам токен
    user_agent  VARCHAR(255),
    expires_at  TIMESTAMPTZ  NOT NULL,
    revoked_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id);

-- ---------------------------------------------------------------------
-- Помещения
-- ---------------------------------------------------------------------
CREATE TABLE room_categories (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name                 VARCHAR(100)  NOT NULL UNIQUE,
    description          TEXT,
    photo_url            VARCHAR(500),                   -- фото категории
    base_price_per_hour  NUMERIC(10,2) NOT NULL CHECK (base_price_per_hour >= 0) -- ориентир цены для категории
);

CREATE TABLE rooms (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    owner_id       BIGINT        NOT NULL REFERENCES users(id),
    category_id    BIGINT        NOT NULL REFERENCES room_categories(id),
    title          VARCHAR(150)  NOT NULL,
    description    TEXT,
    address        VARCHAR(255)  NOT NULL,
    area_m2        NUMERIC(8,2)  NOT NULL CHECK (area_m2 > 0),
    capacity       INTEGER       NOT NULL CHECK (capacity > 0),
    price_per_hour NUMERIC(10,2) NOT NULL CHECK (price_per_hour > 0),
    price_per_day  NUMERIC(10,2) CHECK (price_per_day IS NULL OR price_per_day > 0),
    is_active      BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX rooms_owner_idx    ON rooms (owner_id);
CREATE INDEX rooms_category_idx ON rooms (category_id) WHERE is_active;
CREATE INDEX rooms_price_idx    ON rooms (price_per_hour) WHERE is_active;

CREATE TABLE room_photos (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    room_id    BIGINT       NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    url        VARCHAR(500) NOT NULL,
    is_main    BOOLEAN      NOT NULL DEFAULT FALSE,
    sort_order INTEGER      NOT NULL DEFAULT 0
);
CREATE INDEX room_photos_room_idx ON room_photos (room_id, sort_order);
CREATE UNIQUE INDEX room_photos_one_main_uq ON room_photos (room_id) WHERE is_main; -- не больше одного главного фото

-- Периоды, когда владелец закрыл помещение (ремонт, уборка) — тоже отображаются в календаре как «занято»
CREATE TABLE room_blocks (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    room_id    BIGINT      NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    start_at   TIMESTAMPTZ NOT NULL,
    end_at     TIMESTAMPTZ NOT NULL,
    reason     VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT room_blocks_period CHECK (end_at > start_at),
    CONSTRAINT room_blocks_no_overlap
        EXCLUDE USING gist (room_id WITH =, tstzrange(start_at, end_at) WITH &&)
);

-- ---------------------------------------------------------------------
-- Аренды (бронирования)
-- ---------------------------------------------------------------------
CREATE TABLE bookings (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    room_id          BIGINT         NOT NULL REFERENCES rooms(id),
    tenant_id        BIGINT         NOT NULL REFERENCES users(id),
    start_at         TIMESTAMPTZ    NOT NULL,
    end_at           TIMESTAMPTZ    NOT NULL,
    status           booking_status NOT NULL DEFAULT 'pending',
    total_price      NUMERIC(12,2)  NOT NULL DEFAULT 0 CHECK (total_price >= 0),
    actual_return_at TIMESTAMPTZ,                        -- фактический возврат помещения
    cancelled_at     TIMESTAMPTZ,
    cancel_reason    VARCHAR(255),
    comment          VARCHAR(500),
    created_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),
    CONSTRAINT bookings_period      CHECK (end_at > start_at),
    CONSTRAINT bookings_max_length  CHECK (end_at - start_at <= interval '30 days'),
    CONSTRAINT bookings_return_only_completed CHECK (actual_return_at IS NULL OR status = 'completed'),
    CONSTRAINT bookings_cancel_consistency    CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL)),
    -- Главная защита от двойного бронирования: для одной комнаты нельзя иметь две
    -- «живые» (ожидает / активно) аренды с пересекающимися периодами.
    CONSTRAINT bookings_no_overlap
        EXCLUDE USING gist (room_id WITH =, tstzrange(start_at, end_at) WITH &&)
        WHERE (status IN ('pending', 'active')),
    -- нужен для составных внешних ключей (согласованность отзывов)
    CONSTRAINT bookings_id_room_tenant_uq UNIQUE (id, room_id, tenant_id),
    CONSTRAINT bookings_id_tenant_uq      UNIQUE (id, tenant_id)
);
CREATE INDEX bookings_tenant_idx ON bookings (tenant_id, start_at DESC);
CREATE INDEX bookings_room_period_idx ON bookings USING gist (room_id, tstzrange(start_at, end_at));
CREATE INDEX bookings_status_start_idx ON bookings (status, start_at) WHERE status IN ('pending', 'active');

-- История смены статусов (кто и когда изменил)
CREATE TABLE booking_status_history (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    booking_id  BIGINT         NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    old_status  booking_status,
    new_status  booking_status NOT NULL,
    changed_by  BIGINT REFERENCES users(id),             -- NULL = система (планировщик)
    changed_at  TIMESTAMPTZ    NOT NULL DEFAULT now(),
    note        VARCHAR(255)
);
CREATE INDEX booking_status_history_booking_idx ON booking_status_history (booking_id, changed_at);

-- ---------------------------------------------------------------------
-- Отзывы
-- ---------------------------------------------------------------------
-- Отзыв арендатора о помещении: один отзыв на одну аренду.
CREATE TABLE reviews (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    booking_id BIGINT      NOT NULL UNIQUE,
    room_id    BIGINT      NOT NULL,
    tenant_id  BIGINT      NOT NULL,
    rating     SMALLINT    NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment    TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- room_id и tenant_id обязаны совпадать с данными самой аренды
    CONSTRAINT reviews_booking_fk FOREIGN KEY (booking_id, room_id, tenant_id)
        REFERENCES bookings (id, room_id, tenant_id) ON DELETE CASCADE
);
CREATE INDEX reviews_room_idx ON reviews (room_id, created_at DESC);

-- Отзыв владельца об арендаторе → основа общего рейтинга клиента.
CREATE TABLE tenant_reviews (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    booking_id BIGINT      NOT NULL UNIQUE,
    tenant_id  BIGINT      NOT NULL,
    owner_id   BIGINT      NOT NULL REFERENCES users(id),
    rating     SMALLINT    NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment    TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT tenant_reviews_booking_fk FOREIGN KEY (booking_id, tenant_id)
        REFERENCES bookings (id, tenant_id) ON DELETE CASCADE
);
CREATE INDEX tenant_reviews_tenant_idx ON tenant_reviews (tenant_id);

-- ---------------------------------------------------------------------
-- Штрафы и чёрный список
-- ---------------------------------------------------------------------
CREATE TABLE penalties (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    booking_id BIGINT         NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    reason     penalty_reason NOT NULL,
    amount     NUMERIC(10,2)  NOT NULL CHECK (amount > 0),
    status     penalty_status NOT NULL DEFAULT 'unpaid',
    note       VARCHAR(255),
    created_at TIMESTAMPTZ    NOT NULL DEFAULT now()
);
CREATE INDEX penalties_booking_idx ON penalties (booking_id);

-- owner_id IS NULL → глобальная запись (создал администратор), иначе — чёрный список конкретного владельца
CREATE TABLE blacklist_entries (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id  BIGINT         NOT NULL REFERENCES users(id),
    owner_id   BIGINT         REFERENCES users(id),
    entry_type blacklist_type NOT NULL,
    reason     VARCHAR(500)   NOT NULL,
    booking_id BIGINT         REFERENCES bookings(id) ON DELETE SET NULL,
    created_by BIGINT         REFERENCES users(id),      -- NULL = система (автобан)
    created_at TIMESTAMPTZ    NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ,                              -- NULL = бессрочно
    revoked_at TIMESTAMPTZ,
    revoked_by BIGINT         REFERENCES users(id)
);
CREATE INDEX blacklist_tenant_idx ON blacklist_entries (tenant_id) WHERE revoked_at IS NULL;
