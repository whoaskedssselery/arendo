# Производительность каталога и календаря Arendo

Сравнение SQL-запросов репозитория помещений до и после задачи №9. Исходный код для замера «до» взят из коммита [1324fcf](https://github.com/whoaskedssselery/arendo/commit/1324fcf00befc87116cd3b09d3617adc1337cad5).

## Условия замера

Замеры выполнены на одном экземпляре PostgreSQL 15.20 в Docker с одной и той же выборкой. В базе было 12 004 помещения, 120 006 аренд, 24 005 фото и 8 574 отзыва. Данные включали завершённые и ожидающие аренды и периоды, закрытые владельцем. После загрузки обновлена статистика таблиц через `ANALYZE`.

Для каждого запроса выполнено три прогона для прогрева и 20 измерений `EXPLAIN (ANALYZE, BUFFERS, TIMING OFF)`. В таблице указано время выполнения SQL в PostgreSQL. Для календаря запрошены 30 дней по одному помещению. [Документация EXPLAIN](https://www.postgresql.org/docs/15/using-explain.html)

## Результаты в миллисекундах

| Сценарий | Медиана до | Медиана после | P95 до | P95 после |
| --- | ---: | ---: | ---: | ---: |
| Каталог по цене, первая страница | 17,774 | 0,885 | 18,953 | 1,109 |
| Каталог с категорией, ценой, вместимостью и свободным периодом | 18,413 | 11,193 | 28,612 | 12,306 |
| Каталог по рейтингу | 17,129 | 12,155 | 18,761 | 14,843 |
| Календарь одного помещения на месяц | 0,045 | 0,046 | 0,054 | 0,065 |

Результаты запросов для всех четырёх сценариев совпали по SHA-256. Полные планы, буферы, хэши и все измерения сохранены в приложениях. [Планы до](benchmarks/rooms-before.txt), [планы после](benchmarks/rooms-after.txt)

## Изменения в запросах

- В исходном запросе каталога PostgreSQL рассчитывал рейтинг всех 12 004 помещений, прежде чем выбрать страницу. Для сортировки по цене и дате фото и рейтинг теперь загружаются после выбора страницы, для её 20 помещений. Запрос по цене использует индекс `rooms_price_idx`. При сортировке по рейтингу PostgreSQL агрегирует отзывы по идентификатору помещения до пагинации. [RoomsRepository](../../backend/src/rooms/rooms.repository.ts)
- Проверка доступности использует существующие индексы категории и цены и функцию `fn_room_is_free`. Календарь использует GiST-индексы `bookings_no_overlap` и `room_blocks_no_overlap` в обоих прогонах. Для измеренных сценариев хватило существующих индексов. [Схема БД](../../db/01_schema.sql), [SQL-функции календаря](../../db/02_logic.sql)

На стенде выставлен порог логирования медленных запросов 10 мс. Журнал содержит срабатывания при замерах и контрольный запрос с задержкой 25 мс. [Журнал PostgreSQL](benchmarks/postgresql-slow-queries.txt), [настройка логирования PostgreSQL](https://www.postgresql.org/docs/15/runtime-config-logging.html#GUC-LOG-MIN-DURATION-STATEMENT)

## Как повторить замер

Запустите отдельный контейнер PostgreSQL с базой `arendo_benchmark`.

```powershell
docker run --rm -d --name arendo-benchmark -p 127.0.0.1:55432:5432 -e POSTGRES_DB=arendo_benchmark -e POSTGRES_PASSWORD=arendo-bench postgres:15 -c log_min_duration_statement=10 -c log_parameter_max_length=0
docker exec arendo-benchmark pg_isready -h 127.0.0.1 -U postgres -d arendo_benchmark
```

После готовности PostgreSQL выполните из корня репозитория.

```powershell
$env:DATABASE_URL = 'postgresql://postgres:arendo-bench@127.0.0.1:55432/arendo_benchmark'
npm.cmd --prefix backend ci
npm.cmd --prefix backend run build
npm.cmd --prefix backend run db:init
Get-Content -Raw db/benchmarks/seed.sql | docker exec -i arendo-benchmark psql -X -v ON_ERROR_STOP=1 -U postgres -d arendo_benchmark
node backend/benchmarks/rooms.mjs
docker logs arendo-benchmark
```

Для замера «до» соберите backend коммита `1324fcf` в отдельной копии репозитория, скопируйте туда `backend/benchmarks/rooms.mjs` и запустите его с той же `DATABASE_URL`. Скрипт берёт SQL из собранного `RoomsRepository`. После обоих прогонов остановите контейнер командой `docker stop arendo-benchmark`.
