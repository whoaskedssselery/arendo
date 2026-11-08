// Автотесты БД Arendo. Запуск: cd db/tests && npm i && npm test
// Используется PGlite (PostgreSQL в WASM) — отдельный сервер не нужен.
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..');
const db = new PGlite({ extensions: { btree_gist } });
for (const f of ['01_schema.sql', '02_logic.sql', '03_seed.sql']) await db.exec(readFileSync(join(dir, f), 'utf8'));

let passed = 0, failed = 0;
async function ok(name, fn) {
  try { await fn(); passed++; console.log('  ✓', name); }
  catch (e) { failed++; console.log('  ✗', name, '\n     ', e.message); }
}
async function rejects(name, sql, expectedPart) {
  await ok(name, async () => {
    try { await db.query(sql); } catch (e) {
      if (expectedPart && !e.message.includes(expectedPart)) throw new Error(`другая ошибка: ${e.message}`);
      return;
    }
    throw new Error('запрос должен был завершиться ошибкой');
  });
}
const one = async (sql) => (await db.query(sql)).rows[0];
const H = "date_trunc('hour', now())";

console.log('\nЦелостность и ограничения');
await rejects('дубликат email (без учёта регистра)', `INSERT INTO users(email,password_hash,full_name) VALUES ('ANNA@arendo.test','x','Dup')`, 'users_email_uq');
await rejects('некорректный email', `INSERT INTO users(email,password_hash,full_name) VALUES ('bad','x','Bad')`, 'users_email_format');
await rejects('цена помещения должна быть > 0', `INSERT INTO rooms(owner_id,category_id,title,address,area_m2,capacity,price_per_hour) VALUES (2,1,'x','y',10,1,0)`, 'price_per_hour');
await rejects('конец аренды раньше начала', `INSERT INTO bookings(room_id,tenant_id,start_at,end_at) VALUES (2,4,${H}+interval '5 days',${H}+interval '4 days')`, 'позже даты начала');
await rejects('рейтинг отзыва только 1..5', `UPDATE reviews SET rating = 6 WHERE id = 1`, 'rating');
await rejects('два главных фото у помещения', `INSERT INTO room_photos(room_id,url,is_main) VALUES (1,'/x.jpg',TRUE)`, 'room_photos_one_main_uq');

console.log('\nЗапрет двойного бронирования');
await rejects('пересечение с существующей арендой', `INSERT INTO bookings(room_id,tenant_id,start_at,end_at) VALUES (1,6,${H}+interval '2 days 1 hour',${H}+interval '2 days 4 hours')`, 'bookings_no_overlap');
await ok('соседний слот встык разрешён', async () => {
  await db.query(`INSERT INTO bookings(room_id,tenant_id,start_at,end_at) VALUES (1,6,${H}+interval '2 days 3 hours',${H}+interval '2 days 4 hours')`);
});
await rejects('аренда в закрытый владельцем период', `INSERT INTO bookings(room_id,tenant_id,start_at,end_at) VALUES (4,4,date_trunc('day',now())+interval '5 days 2 hours',date_trunc('day',now())+interval '5 days 4 hours')`, 'закрыто владельцем');
await rejects('блокировка поверх существующей аренды', `INSERT INTO room_blocks(room_id,start_at,end_at) VALUES (1,${H}+interval '3 days',${H}+interval '3 days 1 hour')`, 'уже есть аренда');

console.log('\nБизнес-правила аренды');
await rejects('аренда в прошлом', `INSERT INTO bookings(room_id,tenant_id,start_at,end_at) VALUES (2,4,${H}-interval '2 days',${H}-interval '1 day')`, 'в прошлом');
await rejects('владелец арендует своё помещение', `INSERT INTO bookings(room_id,tenant_id,start_at,end_at) VALUES (2,2,${H}+interval '9 days',${H}+interval '9 days 2 hours')`, 'собственное');
await rejects('владелец/админ не могут быть арендаторами', `INSERT INTO bookings(room_id,tenant_id,start_at,end_at) VALUES (1,3,${H}+interval '9 days',${H}+interval '9 days 2 hours')`, 'только арендаторы');
await ok('стоимость считается автоматически (2 ч × 500)', async () => {
  const r = await one(`INSERT INTO bookings(room_id,tenant_id,start_at,end_at) VALUES (2,4,${H}+interval '8 days',${H}+interval '8 days 2 hours') RETURNING total_price`);
  if (Number(r.total_price) !== 1000) throw new Error('цена ' + r.total_price);
});
await ok('дневной тариф выгоднее почасового (24 ч × 500 → 3500)', async () => {
  const r = await one(`INSERT INTO bookings(room_id,tenant_id,start_at,end_at) VALUES (2,5,${H}+interval '10 days',${H}+interval '11 days') RETURNING total_price`);
  if (Number(r.total_price) !== 3500) throw new Error('цена ' + r.total_price);
});

console.log('\nСтатусы привязаны ко времени');
await ok('новая аренда получает статус pending и запись в истории', async () => {
  const r = await one(`SELECT b.status, (SELECT count(*) FROM booking_status_history h WHERE h.booking_id=b.id)::int AS hist FROM bookings b WHERE b.id = 4`);
  if (r.status !== 'pending' || r.hist !== 1) throw new Error(JSON.stringify(r));
});
await rejects('нельзя активировать аренду до её начала', `UPDATE bookings SET status='active' WHERE id = 4`, 'ещё не началась');
await ok('отмена ожидающей аренды', async () => {
  await db.query(`SELECT fn_cancel_booking(4, 'Передумал')`);
  const r = await one(`SELECT status, cancelled_at IS NOT NULL AS has_date FROM bookings WHERE id=4`);
  if (r.status !== 'cancelled' || !r.has_date) throw new Error(JSON.stringify(r));
});
await rejects('нельзя отменить завершённую аренду', `SELECT fn_cancel_booking(1, 'поздно')`, 'завершённой');
await rejects('нельзя изменить статус отменённой аренды', `UPDATE bookings SET status='pending', cancelled_at=NULL WHERE id = 4`, 'отменённой');
await rejects('нельзя править даты завершённой аренды', `UPDATE bookings SET end_at = end_at + interval '1 hour' WHERE id = 1`, 'Закрытую');
await ok('планировщик переводит наступившие pending → active', async () => {
  // создаём аренду «прямо сейчас» через допустимое окно (старт 1 минуту назад)
  await db.query(`INSERT INTO bookings(room_id,tenant_id,start_at,end_at) VALUES (4,6,now()-interval '1 minute',now()+interval '2 hours')`);
  const n = (await one(`SELECT fn_sync_booking_statuses() AS n`)).n;
  if (n < 1) throw new Error('переведено ' + n);
});

console.log('\nШтрафы, рейтинг, чёрный список');
await ok('возврат вовремя — без штрафа', async () => {
  const id = (await one(`SELECT id FROM bookings WHERE room_id=4 AND status='active'`)).id;
  const p = (await one(`SELECT fn_complete_booking(${id}, now()) AS p`)).p;
  if (Number(p) !== 0) throw new Error('штраф ' + p);
});
async function lateBooking(tenant, room, n) {
  // создаём аренду в будущем, сдвигаем время в прошлое прямым UPDATE (имитация «давней» аренды), активируем и завершаем с опозданием
  const id = (await one(`INSERT INTO bookings(room_id,tenant_id,start_at,end_at) VALUES (${room},${tenant},${H}+interval '${20 + n * 2} days',${H}+interval '${20 + n * 2} days 2 hours') RETURNING id`)).id;
  await db.query(`UPDATE bookings SET start_at = now()-interval '5 hours', end_at = now()-interval '170 minutes' WHERE id=${id}`);
  await db.query(`UPDATE bookings SET status='active' WHERE id=${id}`);
  return (await one(`SELECT fn_complete_booking(${id}, now()) AS p`)).p;
}
await ok('просрочка 2 ч 50 мин (3 начатых часа) → штраф 1.5 × ставка × часы (1100×1.5×3 = 4950)', async () => {
  const p = await lateBooking(6, 3, 1);
  if (Number(p) !== 4950) throw new Error('штраф ' + p);
});
await ok('2-я просрочка → предупреждение, 3-я → автобан', async () => {
  await lateBooking(6, 3, 2);
  let w = await one(`SELECT count(*)::int c FROM blacklist_entries WHERE tenant_id=6 AND entry_type='warning'`);
  if (w.c !== 1) throw new Error('нет предупреждения');
  await lateBooking(6, 3, 3);
  const u = await one(`SELECT status FROM users WHERE id=6`);
  if (u.status !== 'banned') throw new Error('нет бана: ' + u.status);
});
await rejects('забаненный не может создать аренду', `INSERT INTO bookings(room_id,tenant_id,start_at,end_at) VALUES (2,6,${H}+interval '40 days',${H}+interval '40 days 2 hours')`, 'чёрном списке');
await ok('сводка арендатора: рейтинг и просрочки', async () => {
  const r = await one(`SELECT * FROM v_tenant_stats WHERE tenant_id=5`);
  if (Number(r.avg_rating) !== 3 || Number(r.late_returns) !== 1 || !(Number(r.unpaid_penalties) > 0)) throw new Error(JSON.stringify(r));
});

console.log('\nОтзывы');
await rejects('отзыв по несостоявшейся аренде', `INSERT INTO reviews(booking_id,room_id,tenant_id,rating) VALUES (5,1,5,5)`, 'завершённой');
await rejects('второй отзыв на ту же аренду', `INSERT INTO reviews(booking_id,room_id,tenant_id,rating) VALUES (1,1,4,3)`, 'reviews_booking_id_key');
await rejects('отзыв с чужим арендатором (составной FK)', `INSERT INTO reviews(booking_id,room_id,tenant_id,rating) VALUES (3,3,4,5)`, 'reviews_booking_fk');
await rejects('арендатора оценивает не владелец помещения', `INSERT INTO tenant_reviews(booking_id,tenant_id,owner_id,rating) VALUES (2,4,3,5)`, 'только владелец');

console.log('\nКалендарь занятости');
await ok('fn_room_busy_slots возвращает аренды и блокировки', async () => {
  const rows = (await db.query(`SELECT * FROM fn_room_busy_slots(4, now(), now() + interval '30 days')`)).rows;
  if (!rows.some(r => r.kind === 'block')) throw new Error('нет блокировки');
});
await ok('fn_room_is_free: занято / свободно', async () => {
  const busy = (await one(`SELECT fn_room_is_free(1, ${H}+interval '3 days 1 hour', ${H}+interval '3 days 2 hours') AS f`)).f;
  const free = (await one(`SELECT fn_room_is_free(1, ${H}+interval '30 days', ${H}+interval '30 days 1 hour') AS f`)).f;
  if (busy !== false || free !== true) throw new Error(`busy=${busy} free=${free}`);
});

console.log('\nПроизводительность');
await ok('поиск пересечений использует GiST-индекс (EXPLAIN)', async () => {
  await db.exec(`INSERT INTO bookings(room_id,tenant_id,start_at,end_at,status)
                 SELECT 2, 4, now() - (g || ' hours')::interval * 3 - interval '1 year', now() - (g || ' hours')::interval * 3 - interval '1 year' + interval '1 hour', 'completed'
                 FROM generate_series(1, 3000) g`);
  await db.exec('ANALYZE bookings');
  const plan = (await db.query(`EXPLAIN SELECT * FROM bookings WHERE room_id=2 AND tstzrange(start_at,end_at) && tstzrange(now(), now()+interval '1 day')`)).rows.map(r => r['QUERY PLAN']).join('\n');
  if (/Seq Scan on bookings/.test(plan) && !/Index/.test(plan)) throw new Error(plan);
});

console.log(`\nИтог: ${passed} пройдено, ${failed} провалено`);
process.exit(failed ? 1 : 0);
