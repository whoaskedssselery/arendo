// Пункты чек-листа БД, не вошедшие в run.mjs. Нужен настоящий PostgreSQL и пустая база *_test:
//   TEST_DATABASE_URL=postgresql://.../arendo_check_test node manual.mjs
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const pg = createRequire(new URL('../../backend/package.json', import.meta.url))('pg');
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test')) throw new Error('Нужна база с именем *_test');
const db = new pg.Client({ connectionString: url });
await db.connect();
const sql = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
for (const f of ['01_schema.sql', '02_logic.sql', '03_seed.sql']) await db.query(sql(f));

const q = async (text) => (await db.query(text)).rows;
const rejects = async (text, part) => {
  try { await db.query(text); } catch (e) { if (!part || e.message.includes(part)) return; throw e; }
  throw new Error('запрос должен был завершиться ошибкой');
};
const expect = (ok, message) => { if (!ok) throw new Error(message); };
const H = "date_trunc('hour', now())";
const book = async (room, tenant, day, hours = 2) => (await q(
  `INSERT INTO bookings(room_id,tenant_id,start_at,end_at) VALUES (${room},${tenant},${H}+interval '${day} days',${H}+interval '${day} days ${hours} hours') RETURNING id`))[0].id;
const makeActive = async (id, startAgo, endAgo) => {
  await q(`UPDATE bookings SET start_at=now()-interval '${startAgo}', end_at=now()-interval '${endAgo}' WHERE id=${id}`);
  await q(`UPDATE bookings SET status='active' WHERE id=${id}`);
};

const checks = {
  '1.2': () => rejects(sql('01_schema.sql'), 'already exists'),
  '1.3': async () => {
    const [r] = await q(`SELECT
      (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE')::int t,
      (SELECT count(*) FROM pg_type WHERE typtype='e')::int e,
      (SELECT count(*) FROM information_schema.views WHERE table_schema='public')::int v`);
    expect(r.t === 12 && r.e === 6 && r.v === 2, JSON.stringify(r));
  },
  '1.4': async () => {
    const rows = await q(`SELECT t.table_name FROM information_schema.tables t WHERE t.table_schema='public' AND t.table_type='BASE TABLE'
      AND NOT EXISTS (SELECT 1 FROM information_schema.table_constraints c WHERE c.table_name=t.table_name AND c.constraint_type='PRIMARY KEY')`);
    expect(rows.length === 0, JSON.stringify(rows));
  },
  '2.5': () => rejects(`INSERT INTO bookings(room_id,tenant_id,start_at,end_at) VALUES (2,4,${H}+interval '50 days',${H}+interval '81 days')`, 'bookings_max_length'),
  '2.8': () => rejects(`INSERT INTO rooms(owner_id,category_id,title,address,area_m2,capacity,price_per_hour) VALUES (999,999,'x','y',1,1,1)`, 'foreign key'),
  '2.9': () => rejects('DELETE FROM rooms WHERE id=1', 'foreign key'),
  '2.10': async () => {
    await q('DELETE FROM bookings WHERE id=3');
    const [r] = await q(`SELECT (SELECT count(*) FROM booking_status_history WHERE booking_id=3)::int h,
      (SELECT count(*) FROM penalties WHERE booking_id=3)::int p, (SELECT count(*) FROM tenant_reviews WHERE booking_id=3)::int r`);
    expect(r.h === 0 && r.p === 0 && r.r === 0, JSON.stringify(r));
  },
  '3.3': async () => {
    const id = await book(2, 4, 60);
    await q(`SELECT fn_cancel_booking(${id})`);
    await book(2, 5, 60);
  },
  '3.9': async () => {
    await q('UPDATE rooms SET is_active=FALSE WHERE id=4');
    await rejects(`INSERT INTO bookings(room_id,tenant_id,start_at,end_at) VALUES (4,4,${H}+interval '70 days',${H}+interval '70 days 1 hour')`, 'недоступно');
    await q('UPDATE rooms SET is_active=TRUE WHERE id=4');
  },
  '4.8': async () => { const id = await book(2, 4, 62); await rejects(`UPDATE bookings SET status='completed' WHERE id=${id}`, 'не начиналась'); },
  '4.9': async () => {
    const id = await book(2, 4, 64);
    await makeActive(id, '3 hours', '1 hour');
    await q(`SELECT fn_complete_booking(${id}, now() - interval '1 hour')`);
    const rows = await q(`SELECT new_status FROM booking_status_history WHERE booking_id=${id} ORDER BY changed_at, id`);
    expect(rows.map((r) => r.new_status).join() === 'pending,active,completed', JSON.stringify(rows));
  },
  '5.2': async () => {
    const id = await book(2, 4, 66);
    await makeActive(id, '2 hours', '10 minutes');
    const [r] = await q(`SELECT fn_complete_booking(${id}, now()) AS p`);
    expect(Number(r.p) === 0, 'штраф ' + r.p);
  },
  '5.7': async () => {
    await q(`INSERT INTO blacklist_entries(tenant_id,owner_id,entry_type,reason) VALUES (4,2,'ban','проверка')`);
    await rejects(`INSERT INTO bookings(room_id,tenant_id,start_at,end_at) VALUES (1,4,${H}+interval '72 days',${H}+interval '72 days 1 hour')`, 'чёрном списке');
    await book(3, 4, 72);
  },
  '5.8': async () => {
    await q(`UPDATE blacklist_entries SET revoked_at=now() WHERE tenant_id=4`);
    await q(`INSERT INTO blacklist_entries(tenant_id,entry_type,reason,expires_at) VALUES (4,'ban','истёк', now()-interval '1 day')`);
    await book(1, 4, 74);
  },
  '6.4': async () => {
    const [r] = await q(`SELECT v.avg_rating, (SELECT ROUND(AVG(rating),2) FROM reviews WHERE room_id=1) a FROM v_room_rating v WHERE room_id=1`);
    expect(r.avg_rating === r.a, JSON.stringify(r));
  },
  '7.3': async () => {
    const rows = await q(`SELECT status FROM fn_room_busy_slots(2, now()-interval '90 days', now()+interval '90 days')`);
    expect(rows.every((r) => ['pending', 'active', 'blocked'].includes(r.status)), JSON.stringify(rows));
  },
  '9.1': async () => {
    const [r] = await q(`SELECT count(*)::int c FROM users WHERE password_hash NOT LIKE '$2%'`);
    expect(r.c === 0, 'есть пароли не в виде хэша');
  },
};

let failed = 0;
for (const [id, check] of Object.entries(checks)) {
  try { await check(); console.log(`✓ ${id}`); }
  catch (e) { failed++; console.log(`✗ ${id}: ${e.message}`); }
}
console.log(`Итог: ${Object.keys(checks).length - failed} пройдено, ${failed} провалено`);
await db.end();
process.exitCode = failed ? 1 : 0;
