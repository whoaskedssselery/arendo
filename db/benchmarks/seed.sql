BEGIN;
SET LOCAL TIME ZONE 'UTC';

DO $$
BEGIN
    IF current_database() <> 'arendo_benchmark' THEN
        RAISE EXCEPTION 'Use a separate database named arendo_benchmark';
    END IF;
    IF EXISTS (SELECT 1 FROM rooms WHERE title LIKE 'Benchmark room %') THEN
        RAISE EXCEPTION 'The benchmark dataset is already present';
    END IF;
END $$;

INSERT INTO rooms (owner_id, category_id, title, description, address, area_m2, capacity, price_per_hour, price_per_day)
SELECT 2 + (n % 2), 1 + (n % 4), 'Benchmark room ' || lpad(n::text, 5, '0'),
       'Synthetic room used for the catalog benchmark', 'Benchmark street ' || n,
       25 + (n % 150), 4 + (n % 72), 200 + ((n * 23) % 2800),
       CASE WHEN n % 5 = 0 THEN 3500 END
FROM generate_series(1, 12000) AS s(n);

INSERT INTO room_photos (room_id, url, is_main, sort_order)
SELECT r.id, '/img/benchmark/' || r.id || '-' || p.n || '.jpg', p.n = 1, p.n - 1
FROM rooms AS r CROSS JOIN generate_series(1, 2) AS p(n)
WHERE r.title LIKE 'Benchmark room %';

WITH slots AS (
    SELECT r.id AS room_id, 4 + ((r.id + s.n) % 3) AS tenant_id,
           date_trunc('day', r.created_at) + (r.id % 8) * interval '1 hour'
             + CASE WHEN s.n <= 5 THEN (s.n - 6) * interval '7 days'
                    ELSE (s.n - 5) * interval '2 days' END AS start_at,
           CASE WHEN s.n <= 5 THEN 'completed' ELSE 'pending' END::booking_status AS status
    FROM rooms AS r CROSS JOIN generate_series(1, 10) AS s(n)
    WHERE r.title LIKE 'Benchmark room %'
)
INSERT INTO bookings (room_id, tenant_id, start_at, end_at, status, actual_return_at)
SELECT room_id, tenant_id, start_at, start_at + interval '2 hours', status,
       CASE WHEN status = 'completed' THEN start_at + interval '2 hours' END
FROM slots;

INSERT INTO reviews (booking_id, room_id, tenant_id, rating, comment)
SELECT b.id, b.room_id, b.tenant_id, 1 + (b.id % 5), 'Synthetic benchmark review'
FROM bookings AS b JOIN rooms AS r ON r.id = b.room_id
WHERE r.title LIKE 'Benchmark room %' AND b.status = 'completed' AND b.id % 7 = 0;

INSERT INTO room_blocks (room_id, start_at, end_at, reason)
SELECT id, date_trunc('day', created_at) + interval '12 days',
       date_trunc('day', created_at) + interval '13 days', 'Synthetic benchmark block'
FROM rooms
WHERE title LIKE 'Benchmark room %' AND id % 10 = 4;

ANALYZE rooms;
ANALYZE room_photos;
ANALYZE reviews;
ANALYZE bookings;
ANALYZE room_blocks;
COMMIT;
