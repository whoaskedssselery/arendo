-- =====================================================================
-- 03_seed.sql — тестовые данные (пароли — заглушки-хэши, только для разработки)
-- =====================================================================
INSERT INTO users (email, password_hash, full_name, phone, role) VALUES
 ('admin@arendo.test',  '$2b$10$seedseedseedseedseedseedseedseedseedseedseedseedseeds', 'Администратор',     '+79990000001', 'admin'),
 ('owner1@arendo.test', '$2b$10$seedseedseedseedseedseedseedseedseedseedseedseedseeds', 'Иван Петров',       '+79990000002', 'owner'),
 ('owner2@arendo.test', '$2b$10$seedseedseedseedseedseedseedseedseedseedseedseedseeds', 'Мария Соколова',    '+79990000003', 'owner'),
 ('anna@arendo.test',   '$2b$10$seedseedseedseedseedseedseedseedseedseedseedseedseeds', 'Анна Кузнецова',    '+79990000004', 'tenant'),
 ('oleg@arendo.test',   '$2b$10$seedseedseedseedseedseedseedseedseedseedseedseedseeds', 'Олег Смирнов',      '+79990000005', 'tenant'),
 ('dmitry@arendo.test', '$2b$10$seedseedseedseedseedseedseedseedseedseedseedseedseeds', 'Дмитрий Волков',    '+79990000006', 'tenant');

INSERT INTO room_categories (name, description, photo_url, base_price_per_hour) VALUES
 ('Конференц-зал', 'Залы для встреч и презентаций',      '/img/categories/conference.jpg', 1500),
 ('Коворкинг',     'Рабочие места и open space',          '/img/categories/coworking.jpg',   400),
 ('Фотостудия',    'Студии с оборудованием и циклорамой', '/img/categories/studio.jpg',      900),
 ('Склад',         'Складские помещения',                 '/img/categories/storage.jpg',     300);

INSERT INTO rooms (owner_id, category_id, title, description, address, area_m2, capacity, price_per_hour, price_per_day) VALUES
 (2, 1, 'Зал «Нева»',        'Проектор, флипчарт, кофе-пойнт', 'Санкт-Петербург, Невский пр., 10', 60, 30, 1800, 12000),
 (2, 2, 'Коворкинг «Лофт»',  '20 рабочих мест, быстрый Wi-Fi', 'Санкт-Петербург, ул. Рубинштейна, 5', 120, 20, 500, 3500),
 (3, 3, 'Студия «Свет»',     'Циклорама 4x6, импульсный свет', 'Москва, ул. Арбат, 22', 80, 10, 1100, NULL),
 (3, 4, 'Склад №3',          'Сухой склад, пандус',            'Москва, Складочная ул., 1', 200, 5, 350, 2500);

INSERT INTO room_photos (room_id, url, is_main, sort_order) VALUES
 (1, '/img/rooms/neva-1.jpg', TRUE, 0), (1, '/img/rooms/neva-2.jpg', FALSE, 1),
 (2, '/img/rooms/loft-1.jpg', TRUE, 0), (3, '/img/rooms/svet-1.jpg', TRUE, 0),
 (4, '/img/rooms/sklad-1.jpg', TRUE, 0);

-- Исторические аренды (вставляются сразу в завершённом статусе — это импорт данных)
INSERT INTO bookings (room_id, tenant_id, start_at, end_at, status, actual_return_at) VALUES
 (1, 4, now() - interval '30 days', now() - interval '30 days' + interval '3 hours', 'completed', now() - interval '30 days' + interval '3 hours'),
 (2, 4, now() - interval '20 days', now() - interval '20 days' + interval '8 hours', 'completed', now() - interval '20 days' + interval '8 hours'),
 (3, 5, now() - interval '10 days', now() - interval '10 days' + interval '4 hours', 'completed', now() - interval '10 days' + interval '4 hours 40 minutes');
INSERT INTO penalties (booking_id, reason, amount, note) VALUES (3, 'late_return', 1650, 'Просрочка возврата, часов: 1');

INSERT INTO reviews (booking_id, room_id, tenant_id, rating, comment) VALUES
 (1, 1, 4, 5, 'Отличный зал, всё работало'),
 (2, 2, 4, 4, 'Удобно, но было шумно');
INSERT INTO tenant_reviews (booking_id, tenant_id, owner_id, rating, comment) VALUES
 (1, 4, 2, 5, 'Аккуратный арендатор'),
 (3, 5, 3, 3, 'Вернул помещение с опозданием');

-- Будущие аренды (проходят все проверки триггеров)
INSERT INTO bookings (room_id, tenant_id, start_at, end_at) VALUES
 (1, 4, date_trunc('hour', now()) + interval '2 days',  date_trunc('hour', now()) + interval '2 days 3 hours'),
 (1, 5, date_trunc('hour', now()) + interval '3 days',  date_trunc('hour', now()) + interval '3 days 2 hours'),
 (3, 6, date_trunc('hour', now()) + interval '1 day',   date_trunc('hour', now()) + interval '1 day 5 hours');

INSERT INTO room_blocks (room_id, start_at, end_at, reason) VALUES
 (4, date_trunc('day', now()) + interval '5 days', date_trunc('day', now()) + interval '6 days', 'Инвентаризация');
