import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const api = "http://127.0.0.1:3000/api/v1";
const local = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:00`;
test.skip(
  !process.env.LIVE_API,
  "Запуск отдельно с LIVE_API=1 и настоящим backend",
);
test("настоящий API: регистрация, создание, конфликт, отмена, изоляция ролей и приёмка", async ({
  page,
  request,
}) => {
  const suffix = Date.now();
  let account = 0;
  const register = async (role: string) => {
    const res = await request.post(api + "/auth/register", {
      data: {
        fullName: "Тест " + role,
        email: `e2e-${role}-${suffix}-${++account}@arendo.test`,
        password: "Arendo123!",
        role,
      },
    });
    expect(res.status()).toBe(201);
    return res.json();
  };
  const tenant = await register("tenant"),
    other = await register("tenant"),
    owner = await register("owner");
  const headers = { Authorization: `Bearer ${tenant.accessToken}` };
  const ownerHeaders = { Authorization: `Bearer ${owner.accessToken}` };
  const created = await request.post(api + "/rooms", {
    headers: ownerHeaders,
    data: {
      categoryId: 1,
      title: "E2E пространство " + suffix,
      address: "Москва, Тестовая, 1",
      areaM2: 50,
      capacity: 10,
      pricePerHour: 1000,
      pricePerDay: 7000,
    },
  });
  expect(created.status()).toBe(201);
  const room = await created.json();
  await page.goto("/");
  await page.evaluate(
    (s) => sessionStorage.setItem("arendo.session", JSON.stringify(s)),
    tenant,
  );
  await page.goto(`/rooms/${room.id}`);
  const start = new Date();
  start.setDate(start.getDate() + 8);
  start.setHours(10, 0, 0, 0);
  const end = new Date(+start + 7200000);
  await page.getByLabel("Начало аренды", { exact: true }).fill(local(start));
  await page.getByLabel("Окончание аренды", { exact: true }).fill(local(end));
  await page.getByRole("button", { name: "Арендовать", exact: true }).click();
  await expect(page).toHaveURL(/bookings/);
  const card = page.locator(".booking-row").filter({ hasText: room.title });
  await expect(card.getByText("Ожидает", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "../docs/frontend/screenshots/bookings-live.png",
    fullPage: true,
  });
  const all = await (await request.get(api + "/bookings", { headers })).json();
  const booking = all.find((b: any) => b.roomId === room.id);
  expect(booking.totalPrice).toBe(2000);
  expect(
    (
      await request.post(api + "/bookings", {
        headers,
        data: {
          roomId: room.id,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
        },
      })
    ).status(),
  ).toBe(409);
  const foreign = await request.get(api + "/bookings", {
    headers: { Authorization: `Bearer ${other.accessToken}` },
  });
  expect(await foreign.json()).toEqual([]);
  expect(
    (
      await request.post(`${api}/bookings/${booking.id}/cancel`, {
        headers: { Authorization: `Bearer ${other.accessToken}` },
        data: {},
      })
    ).status(),
  ).toBe(403);
  expect((await request.get(api + "/admin/users", { headers })).status()).toBe(
    403,
  );
  const busy = await (
    await request.get(
      `${api}/rooms/${room.id}/calendar?from=${start.toISOString()}&to=${end.toISOString()}`,
    )
  ).json();
  expect(busy).toHaveLength(1);
  page.on("dialog", (d) => d.accept());
  await card.getByRole("button", { name: "Отменить аренду" }).click();
  await expect(card.getByText("Отменено", { exact: true })).toBeVisible();
  const free = await (
    await request.get(
      `${api}/rooms/${room.id}/calendar?from=${start.toISOString()}&to=${end.toISOString()}`,
    )
  ).json();
  expect(free).toHaveLength(0);
  expect((await request.get(api + "/bookings")).status()).toBe(401);
  // Only the explicitly named disposable test DB may be manipulated for past-time fixtures.
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith("_test"))
    throw new Error("TEST_DATABASE_URL must name a disposable *_test database");
  const { Pool } = require("../../backend/node_modules/pg");
  const db = new Pool({ connectionString: url });
  let activeId: number;
  try {
    const r = await db.query(
      `INSERT INTO bookings(room_id,tenant_id,start_at,end_at,status) VALUES($1,$2,now()-interval '1 hour',now()+interval '1 hour','active') RETURNING id`,
      [room.id, tenant.user.id],
    );
    activeId = Number(r.rows[0].id);
  } finally {
    await db.end();
  }
  await page.evaluate(
    (s) => sessionStorage.setItem("arendo.session", JSON.stringify(s)),
    owner,
  );
  await page.goto("/owner");
  await expect(page.locator(".room-card")).toHaveCount(1);
  await page.screenshot({
    path: "../docs/frontend/screenshots/owner-live.png",
    fullPage: true,
  });
  await page.goto("/bookings");
  const active = page.locator(`[data-booking-id="${activeId}"]`);
  await active
    .getByRole("link", { name: `Карточка арендатора №${tenant.user.id}` })
    .click();
  await expect(
    page.getByRole("heading", { name: "Тест tenant" }),
  ).toBeVisible();
  await page.screenshot({
    path: "../docs/frontend/screenshots/tenant-live.png",
    fullPage: true,
  });
  await page.goBack();
  await active.getByRole("button", { name: "Принять помещение" }).click();
  await expect(active.getByText("Завершено", { exact: true })).toBeVisible();
  expect(
    (
      await request.post(`${api}/bookings/${activeId}/cancel`, {
        headers: ownerHeaders,
        data: {},
      })
    ).status(),
  ).toBe(409);
});
test("настоящий API: Query cache, debounce, AbortSignal и скрины", async ({
  page,
}) => {
  const calls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/v1/"))
      calls.push(new URL(r.url()).pathname + new URL(r.url()).search);
  });
  await page.goto("/");
  await expect(page.locator(".room-card").first()).toBeVisible();
  const first = page.locator(".room-card").first();
  const href = await first.getAttribute("href");
  await first.click();
  await expect(
    page.getByRole("heading", { name: "Календарь занятости" }),
  ).toBeVisible();
  await expect(page.locator(".calendar button").first()).toBeVisible();
  const coldRequests = [...calls];
  const before = calls.filter((p) => p === "/api/v1" + href).length;
  await page.screenshot({
    path: "../docs/frontend/screenshots/room-live.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Каталог пространств" }).click();
  await page.locator(`.room-card[href="${href}"]`).click();
  await expect(
    page.getByRole("heading", { name: "Календарь занятости" }),
  ).toBeVisible();
  expect(calls.filter((p) => p === "/api/v1" + href).length).toBe(before);
  const warmRequests = calls.slice(coldRequests.length);
  expect(warmRequests).toEqual([]);
  // Cached categories/catalog revisits generate zero additional HTTP requests within staleTime.
  await page.getByRole("link", { name: "Каталог пространств" }).click();
  const catalogBefore = calls.filter((p) =>
    p.startsWith("/api/v1/rooms?"),
  ).length;
  const input = page.getByLabel("Поиск", { exact: true });
  await input.pressSequentially("Лофт", { delay: 40 });
  await expect(page).toHaveURL(/q=/);
  await expect.poll(() => calls.filter((p) => p.includes("q=")).length).toBe(1);
  expect(calls.filter((p) => p.startsWith("/api/v1/rooms?")).length).toBe(
    catalogBefore + 1,
  );
  const { writeFile } = await import("node:fs/promises");
  await writeFile(
    "../docs/frontend/network-cache.json",
    JSON.stringify(
      {
        coldRequests,
        warmRequests,
        room: href,
        firstVisit: before,
        repeatVisit:
          calls.filter((p) => p === "/api/v1" + href).length - before,
        debouncedSearchRequests: 1,
        requests: calls,
      },
      null,
      2,
    ),
  );
});
test("API: обновление access-токена и администрирование с отзывом сессии", async ({
  page,
  request,
}) => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith("_test"))
    throw new Error("Use a disposable *_test DB");
  const register = async (email: string) => {
    const r = await request.post(api + "/auth/register", {
      data: {
        fullName: "Админ E2E",
        email,
        password: "Arendo123!",
        role: "tenant",
      },
    });
    expect(r.status()).toBe(201);
    return r.json();
  };
  const session = await register(`admin-e2e-${Date.now()}@arendo.test`);
  const target = await register(`target-e2e-${Date.now()}@arendo.test`);
  const { Pool } = require("../../backend/node_modules/pg");
  const db = new Pool({ connectionString: url });
  try {
    await db.query("UPDATE users SET role='admin' WHERE id=$1", [
      session.user.id,
    ]);
  } finally {
    await db.end();
  }
  session.user.role = "admin";
  session.accessToken = "expired-test-token";
  let refresh = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/auth/refresh")) refresh++;
  });
  await page.goto("/");
  await page.evaluate(
    (s) => sessionStorage.setItem("arendo.session", JSON.stringify(s)),
    session,
  );
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Администрирование" }),
  ).toBeVisible();
  await expect(page.locator("tbody tr").first()).toBeVisible();
  expect(refresh).toBe(1);
  // API permissions use current DB role; use rotated session from browser.
  const current = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("arendo.session")!),
  );
  const headers = { Authorization: `Bearer ${current.accessToken}` };
  expect(
    (
      await request.patch(`${api}/admin/users/${current.user.id}/status`, {
        headers,
        data: { status: "banned" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.patch(`${api}/admin/users/${target.user.id}/status`, {
        headers,
        data: { status: "banned" },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await request.get(api + "/auth/me", {
        headers: { Authorization: `Bearer ${target.accessToken}` },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.patch(`${api}/admin/users/${target.user.id}/status`, {
        headers,
        data: { status: "active" },
      })
    ).status(),
  ).toBe(200);
  await page.screenshot({
    path: "../docs/frontend/screenshots/admin-live.png",
    fullPage: true,
  });
});
test("API: устаревший поиск отменяется, ошибки отображаются и повтор работает", async ({
  page,
}) => {
  let aborted = false;
  page.on("requestfailed", (r) => {
    if (r.url().includes("q=") && r.failure()?.errorText.includes("ABORTED"))
      aborted = true;
  });
  await page.route("**/api/v1/rooms?**", async (route) => {
    if (route.request().url().includes("q=")) {
      await new Promise((r) => setTimeout(r, 1400));
    }
    try {
      await route.continue();
    } catch {
      /* cancellation is expected */
    }
  });
  await page.goto("/");
  await expect(page.locator(".room-card").first()).toBeVisible();
  const input = page.getByLabel("Поиск", { exact: true });
  await input.fill("Нева");
  await page.waitForRequest((r) => r.url().includes("q="));
  await input.fill("Склад");
  await expect(page.locator(".room-card")).toHaveCount(1);
  await expect(page.locator(".room-card")).toContainText("Склад");
  expect(aborted).toBeTruthy();
  await page.unrouteAll({ behavior: "wait" });
  await page.route("**/api/v1/rooms/99999999", (r) =>
    r.fulfill({ status: 503, contentType: "application/json", body: "{}" }),
  );
  await page.goto("/rooms/99999999");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: "Повторить" })).toBeVisible();
  await page.unrouteAll();
  await page.getByRole("button", { name: "Повторить" }).click();
  await expect(page.getByRole("alert")).toContainText("Данные не найдены");
});
