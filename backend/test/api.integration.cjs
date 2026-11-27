// Интеграционные проверки API. Нужны запущенный сервер и отдельная тестовая БД:
//   API_URL=http://127.0.0.1:3000/api/v1 TEST_DATABASE_URL=postgresql://.../arendo_test npm run test:api
const test = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('pg');

const api = process.env.API_URL ?? 'http://127.0.0.1:3000/api/v1';
const dbUrl = process.env.TEST_DATABASE_URL;
if (!dbUrl || !new URL(dbUrl).pathname.endsWith('_test')) {
  throw new Error('TEST_DATABASE_URL должен указывать на базу с именем *_test');
}

const run = Date.now();
const password = 'Arendo-test-123';
const hour = 3_600_000;
const slot = (days, hours = 2) => {
  const start = new Date(Date.now() + days * 24 * hour);
  start.setUTCMinutes(0, 0, 0);
  return { startAt: start.toISOString(), endAt: new Date(+start + hours * hour).toISOString() };
};

async function call(method, path, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body) headers['content-type'] = 'application/json';
  const response = await fetch(api + path, { method, headers, body: form ?? (body && JSON.stringify(body)) });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : undefined; } catch { data = text; }
  return { status: response.status, data, headers: response.headers };
}
async function register(name, role) {
  const { status, data } = await call('POST', '/auth/register', {
    body: { fullName: `Тест ${name}`, email: `${name}-${run}@arendo.test`, password, role },
  });
  assert.equal(status, 201, JSON.stringify(data));
  return { token: data.accessToken, id: data.user.id, email: data.user.email };
}

const db = new Client({ connectionString: dbUrl });
let owner, otherOwner, tenant, otherTenant, admin, room, booking;

test.before(async () => {
  await db.connect();
  [owner, otherOwner, tenant, otherTenant] = [
    await register('owner', 'owner'), await register('owner2', 'owner'),
    await register('tenant', 'tenant'), await register('tenant2', 'tenant'),
  ];
  admin = await register('admin', 'tenant');
  await db.query("UPDATE users SET role = 'admin' WHERE id = $1", [admin.id]);
});
test.after(() => db.end());

test('защитные заголовки и health', async () => {
  const { status, headers } = await call('GET', '/health');
  assert.equal(status, 200);
  assert.equal(headers.get('x-content-type-options'), 'nosniff');
  assert.equal(headers.get('x-powered-by'), null);
});

test('категории: управляет только админ', async () => {
  const body = { name: `Тестовая ${run}`, basePricePerHour: 500 };
  assert.equal((await call('POST', '/categories', { body })).status, 401);
  assert.equal((await call('POST', '/categories', { body, token: owner.token })).status, 403);
  const created = await call('POST', '/categories', { body, token: admin.token });
  assert.equal(created.status, 201);
  assert.equal((await call('POST', '/categories', { body, token: admin.token })).status, 409);
  const patched = await call('PATCH', `/categories/${created.data.id}`, { body: { basePricePerHour: 700 }, token: admin.token });
  assert.equal(patched.data.basePricePerHour, 700);
  assert.equal((await call('DELETE', `/categories/${created.data.id}`, { token: admin.token })).status, 204);
  assert.equal((await call('DELETE', '/categories/1', { token: admin.token })).status, 409);
});

test('иконка категории: из набора и своим файлом', async () => {
  const body = { name: `Иконки ${run}`, basePricePerHour: 100 };
  const { data: category } = await call('POST', '/categories', { body, token: admin.token });
  const path = `/categories/${category.id}`;
  const chosen = await call('PATCH', path, { body: { photoUrl: '/icons/camera' }, token: admin.token });
  assert.equal(chosen.data.photoUrl, '/icons/camera');
  const file = (bytes) => {
    const form = new FormData();
    form.append('file', new Blob([bytes]), 'icon.png');
    return form;
  };
  const upload = (bytes, token) => call('POST', `${path}/icon`, { form: file(bytes), token });
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  assert.equal((await upload(png, owner.token)).status, 403);
  assert.equal((await upload('<svg/>', admin.token)).status, 422);
  assert.equal((await upload(Buffer.concat([png, Buffer.alloc(600 * 1024)]), admin.token)).status, 413);
  const uploaded = await upload(png, admin.token);
  assert.equal(uploaded.status, 201, JSON.stringify(uploaded.data));
  const url = new URL(uploaded.data.photoUrl, api);
  assert.equal((await fetch(url)).status, 200);
  const listed = (await call('GET', '/categories')).data.find((c) => c.id === category.id);
  assert.equal(listed.photoUrl, uploaded.data.photoUrl);
  // смена на встроенную иконку удаляет загруженный файл
  await call('PATCH', path, { body: { photoUrl: '/icons/music' }, token: admin.token });
  assert.equal((await fetch(url)).status, 404);
  assert.equal((await call('DELETE', path, { token: admin.token })).status, 204);
});

test('помещение и фото: владелец, проверка содержимого файла', async () => {
  const created = await call('POST', '/rooms', { token: owner.token, body: {
    categoryId: 1, title: `Зал ${run}`, address: 'Тестовая, 1', areaM2: 40, capacity: 10, pricePerHour: 1000,
  } });
  assert.equal(created.status, 201);
  room = created.data;
  const upload = (bytes, token) => {
    const form = new FormData();
    form.append('file', new Blob([bytes]), 'photo.png');
    return call('POST', `/rooms/${room.id}/photos`, { token, form });
  };
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  assert.equal((await upload(png, otherOwner.token)).status, 403);
  assert.equal((await upload(Buffer.from('<svg onload=alert(1)>'), owner.token)).status, 422);
  assert.equal((await upload(Buffer.alloc(6 * 1024 * 1024), owner.token)).status, 413);
  const photo = await upload(png, owner.token);
  assert.equal(photo.status, 201, JSON.stringify(photo.data));
  assert.equal(photo.data.isMain, true);
  const file = await fetch(new URL(photo.data.url, api));
  assert.equal(file.status, 200);
  assert.equal(file.headers.get('content-type'), 'image/png');
  assert.equal((await call('DELETE', `/rooms/${room.id}/photos/${photo.data.id}`, { token: owner.token })).status, 204);
});

test('закрытие периода видно в календаре и запрещает аренду', async () => {
  const period = slot(20);
  assert.equal((await call('POST', `/rooms/${room.id}/blocks`, { token: otherOwner.token, body: period })).status, 403);
  const block = await call('POST', `/rooms/${room.id}/blocks`, { token: owner.token, body: { ...period, reason: 'Ремонт' } });
  assert.equal(block.status, 201);
  const calendar = await call('GET', `/rooms/${room.id}/calendar?from=${period.startAt}&to=${period.endAt}`);
  assert.equal(calendar.data[0].kind, 'block');
  const refused = await call('POST', '/bookings', { token: tenant.token, body: { roomId: room.id, ...period } });
  assert.equal(refused.status, 409);
  assert.match(refused.data.message, /закрыл/);
  assert.equal((await call('GET', `/rooms/${room.id}/blocks`, { token: owner.token })).data.length, 1);
  assert.equal((await call('DELETE', `/rooms/${room.id}/blocks/${block.data.id}`, { token: owner.token })).status, 204);
});

test('100 одновременных броней на одно время: проходит ровно одна', async () => {
  const body = { roomId: room.id, ...slot(5) };
  const results = await Promise.all(
    Array.from({ length: 100 }, () => call('POST', '/bookings', { token: tenant.token, body })),
  );
  const count = (status) => results.filter((r) => r.status === status).length;
  assert.equal(count(201), 1, `успешных ${count(201)}`);
  assert.equal(count(409), 99, `конфликтов ${count(409)}`);
  booking = results.find((r) => r.status === 201).data;
});

test('деактивация невозможна при живой аренде', async () => {
  assert.equal((await call('DELETE', `/rooms/${room.id}`, { token: owner.token })).status, 409);
});

test('аренда видна только участникам', async () => {
  assert.equal((await call('GET', `/bookings/${booking.id}`, { token: tenant.token })).status, 200);
  assert.equal((await call('GET', `/bookings/${booking.id}`, { token: owner.token })).status, 200);
  assert.equal((await call('GET', `/bookings/${booking.id}`, { token: otherTenant.token })).status, 404);
});

test('просрочка даёт штраф; отзывы только по завершённой аренде и один раз', async () => {
  const review = { rating: 5, comment: 'Отлично' };
  assert.equal((await call('POST', `/bookings/${booking.id}/review`, { token: tenant.token, body: review })).status, 409);
  await db.query(
    "UPDATE bookings SET start_at = now() - interval '5 hours', end_at = now() - interval '3 hours' WHERE id = $1",
    [booking.id],
  );
  await db.query("UPDATE bookings SET status = 'active' WHERE id = $1", [booking.id]);
  const completed = await call('POST', `/bookings/${booking.id}/complete`, { token: owner.token, body: {} });
  assert.equal(completed.status, 200, JSON.stringify(completed.data));
  assert.ok(completed.data.penaltyAmount > 0);

  assert.equal((await call('POST', `/bookings/${booking.id}/review`, { token: otherTenant.token, body: review })).status, 403);
  assert.equal((await call('POST', `/bookings/${booking.id}/review`, { token: tenant.token, body: { rating: 6 } })).status, 422);
  assert.equal((await call('POST', `/bookings/${booking.id}/review`, { token: tenant.token, body: review })).status, 201);
  assert.equal((await call('POST', `/bookings/${booking.id}/review`, { token: tenant.token, body: review })).status, 409);
  assert.equal((await call('GET', `/rooms/${room.id}/reviews`)).data[0].comment, 'Отлично');
  assert.equal((await call('GET', `/rooms/${room.id}`)).data.avgRating, 5);

  assert.equal((await call('POST', `/bookings/${booking.id}/tenant-review`, { token: otherOwner.token, body: { rating: 3 } })).status, 403);
  assert.equal((await call('POST', `/bookings/${booking.id}/tenant-review`, { token: owner.token, body: { rating: 3 } })).status, 201);
  const card = await call('GET', `/tenants/${tenant.id}`, { token: owner.token });
  assert.equal(card.data.avgRating, 3);
  assert.equal(card.data.email, tenant.email);
  assert.equal(card.data.history.length, 1);
});

test('штрафы: видимость и погашение', async () => {
  const mine = await call('GET', '/penalties', { token: tenant.token });
  assert.equal(mine.data.length, 1);
  assert.equal((await call('GET', '/penalties', { token: otherOwner.token })).data.length, 0);
  const id = mine.data[0].id;
  assert.equal((await call('PATCH', `/penalties/${id}`, { token: tenant.token, body: { status: 'paid' } })).status, 403);
  assert.equal((await call('PATCH', `/penalties/${id}`, { token: owner.token, body: { status: 'paid' } })).status, 200);
  assert.equal((await call('PATCH', `/penalties/${id}`, { token: owner.token, body: { status: 'waived' } })).status, 404);
});

test('чёрный список владельца запрещает аренду только у него', async () => {
  const body = { tenantId: tenant.id, entryType: 'ban', reason: 'Испортил мебель' };
  assert.equal((await call('POST', '/blacklist', { token: otherOwner.token, body })).status, 403);
  const entry = await call('POST', '/blacklist', { token: owner.token, body });
  assert.equal(entry.status, 201, JSON.stringify(entry.data));
  const refused = await call('POST', '/bookings', { token: tenant.token, body: { roomId: room.id, ...slot(30) } });
  assert.equal(refused.status, 403);
  assert.equal((await call('POST', '/bookings', { token: tenant.token, body: { roomId: 1, ...slot(31) } })).status, 201);
  assert.equal((await call('DELETE', `/blacklist/${entry.data.id}`, { token: otherOwner.token })).status, 404);
  assert.equal((await call('DELETE', `/blacklist/${entry.data.id}`, { token: owner.token })).status, 204);
  assert.equal((await call('POST', '/bookings', { token: tenant.token, body: { roomId: room.id, ...slot(30) } })).status, 201);
});

test('разблокировка администратором снимает и глобальный бан', async () => {
  await db.query(
    "INSERT INTO blacklist_entries (tenant_id, entry_type, reason) VALUES ($1, 'ban', 'Автобан')", [otherTenant.id],
  );
  await db.query("UPDATE users SET status = 'banned' WHERE id = $1", [otherTenant.id]);
  const unban = await call('PATCH', `/admin/users/${otherTenant.id}/status`, { token: admin.token, body: { status: 'active' } });
  assert.equal(unban.status, 200);
  const login = await call('POST', '/auth/login', { body: { email: otherTenant.email, password } });
  assert.equal(login.status, 200);
  const created = await call('POST', '/bookings', { token: login.data.accessToken, body: { roomId: room.id, ...slot(40) } });
  assert.equal(created.status, 201, JSON.stringify(created.data));
});

test('списки арендаторов изолированы по владельцам', async () => {
  const mine = await call('GET', '/tenants', { token: owner.token });
  assert.ok(mine.data.some((t) => t.tenantId === tenant.id));
  assert.equal((await call('GET', '/tenants', { token: otherOwner.token })).data.length, 0);
  assert.equal((await call('GET', '/tenants', { token: tenant.token })).status, 403);
});
