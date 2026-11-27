-- =====================================================================
-- 05_demo_data.sql — расширенный набор помещений для показа и проверки.
-- Нужен после 01–03. Повторный запуск ничего не дублирует.
--   docker compose exec db psql -U postgres -d arendo -v ON_ERROR_STOP=1 -f /sql/05_demo_data.sql
-- =====================================================================
\encoding UTF8
BEGIN;

INSERT INTO room_categories (name, base_price_per_hour) VALUES
 ('Конференц-зал', 1500), ('Коворкинг', 400), ('Фотостудия', 900), ('Склад', 300)
ON CONFLICT (name) DO NOTHING;

CREATE TEMP TABLE demo_rooms (
    owner_email text, category text, title text, description text, address text,
    area numeric, capacity int, hour_price numeric, day_price numeric
) ON COMMIT DROP;

INSERT INTO demo_rooms VALUES
 ('owner1@arendo.test','Конференц-зал','Зал «Балтика»','Экран 100 дюймов, видеосвязь, доска','Санкт-Петербург, Лиговский пр., 74',45,20,1400,9500),
 ('owner1@arendo.test','Конференц-зал','Переговорная «Фонтанка»','Стол на восемь мест, телевизор, кофе','Санкт-Петербург, наб. реки Фонтанки, 59',22,8,700,4800),
 ('owner2@arendo.test','Конференц-зал','Конференц-зал «Таганка»','Сцена, микрофоны, проектор','Москва, Нижняя Радищевская ул., 5',150,100,3800,26000),
 ('owner2@arendo.test','Конференц-зал','Переговорная «Чистые пруды»','Тихая комната для собеседований','Москва, Чистопрудный бульвар, 12',18,6,600,NULL),
 ('owner1@arendo.test','Конференц-зал','Лекционный зал «Университет»','Амфитеатр, проектор, звук','Санкт-Петербург, Биржевая линия, 14',120,80,2900,20000),
 ('owner2@arendo.test','Конференц-зал','Зал «Казань Холл»','Трансформируемая расстановка мебели','Казань, ул. Баумана, 36',90,50,1900,13000),
 ('owner1@arendo.test','Коворкинг','Коворкинг «Маяк»','Места у окна, принтер, переговорка','Санкт-Петербург, ул. Маяковского, 11',95,18,350,2400),
 ('owner1@arendo.test','Коворкинг','Лофт «Красный треугольник»','Кирпичные стены, большие столы, кухня','Санкт-Петербург, наб. Обводного канала, 138',180,40,900,6500),
 ('owner2@arendo.test','Коворкинг','Коворкинг «Бауманский»','Круглосуточный доступ, мониторы','Москва, Бауманская ул., 7',140,30,450,3000),
 ('owner2@arendo.test','Коворкинг','Коворкинг «Тихий этаж»','Кабинки для звонков, без разговоров в зале','Москва, Мясницкая ул., 24',70,14,420,2800),
 ('owner2@arendo.test','Коворкинг','Лофт «Фабрика»','Пространство под мастер-классы','Казань, ул. Петербургская, 1',110,35,650,4500),
 ('owner1@arendo.test','Коворкинг','Коворкинг «Академ»','Маркерные стены, локеры','Новосибирск, Морской пр., 2',85,16,300,2000),
 ('owner1@arendo.test','Фотостудия','Фотостудия «Белый куб»','Белая циклорама, гримёрка','Санкт-Петербург, ул. Восстания, 24',65,12,1200,NULL),
 ('owner1@arendo.test','Фотостудия','Фотостудия «Мансарда»','Естественный свет, интерьерные зоны','Санкт-Петербург, Малый пр. П. С., 4',55,8,950,6800),
 ('owner2@arendo.test','Фотостудия','Фотостудия «Хромакей»','Зелёный фон, видеосвет, звукоизоляция','Москва, Большая Новодмитровская ул., 36',90,15,1600,11000),
 ('owner2@arendo.test','Фотостудия','Видеостудия «Подкаст»','Четыре микрофона, пульт, две камеры','Москва, ул. Покровка, 17',30,6,1300,NULL),
 ('owner2@arendo.test','Фотостудия','Фотостудия «Оранжерея»','Живые растения, панорамные окна','Казань, ул. Спартаковская, 2',75,10,1000,7000),
 ('owner1@arendo.test','Склад','Склад «Парнас»','Отапливаемый, въезд для «Газели»','Санкт-Петербург, 6-й Верхний пер., 12',320,10,450,3200),
 ('owner1@arendo.test','Склад','Склад-ячейка «Купчино»','Небольшая ячейка с видеонаблюдением','Санкт-Петербург, Софийская ул., 8',18,2,120,700),
 ('owner2@arendo.test','Склад','Склад «Южные ворота»','Стеллажи, погрузочная рампа','Москва, Промышленная ул., 11',500,15,700,5200),
 ('owner2@arendo.test','Склад','Холодный склад «Север»','Неотапливаемое помещение под оборудование','Москва, Дмитровское шоссе, 100',260,8,250,1700),
 ('owner2@arendo.test','Склад','Склад «Волжский»','Охрана, паллетные места','Казань, ул. Тэцевская, 14',210,6,280,1900);

CREATE TEMP TABLE new_rooms (id bigint, owner_id bigint) ON COMMIT DROP;

WITH added AS (
    INSERT INTO rooms (owner_id, category_id, title, description, address, area_m2, capacity, price_per_hour, price_per_day)
    SELECT u.id, c.id, d.title, d.description, d.address, d.area, d.capacity, d.hour_price, d.day_price
    FROM demo_rooms d
    JOIN users u ON u.email = d.owner_email
    JOIN room_categories c ON c.name = d.category
    WHERE NOT EXISTS (SELECT 1 FROM rooms r WHERE r.title = d.title)
    RETURNING id, owner_id
)
INSERT INTO new_rooms SELECT id, owner_id FROM added;

-- Завершённые аренды и отзывы для части новых помещений, чтобы в каталоге были рейтинги.
CREATE TEMP TABLE new_history ON COMMIT DROP AS
WITH past AS (
    INSERT INTO bookings (room_id, tenant_id, start_at, end_at, status, actual_return_at)
    SELECT n.id, u.id, p.start_at, p.start_at + interval '2 hours', 'completed', p.start_at + interval '2 hours'
    FROM new_rooms n
    JOIN users u ON u.email = (ARRAY['anna@arendo.test','oleg@arendo.test','dmitry@arendo.test'])[1 + n.id % 3]
    CROSS JOIN LATERAL (SELECT date_trunc('hour', now()) - make_interval(days => 5 + (n.id % 40)::int) AS start_at) p
    WHERE n.id % 3 <> 0
    RETURNING id, room_id, tenant_id
)
SELECT * FROM past;

INSERT INTO reviews (booking_id, room_id, tenant_id, rating, comment)
SELECT id, room_id, tenant_id, 3 + (room_id % 3),
       (ARRAY['Нормально, но хотелось бы тише', 'Всё как в описании', 'Отличное место, вернёмся'])[1 + room_id % 3]
FROM new_history;

SELECT (SELECT count(*) FROM new_rooms) AS "добавлено помещений",
       (SELECT count(*) FROM rooms WHERE is_active) AS "всего в каталоге";
COMMIT;
