import { createRequire } from "node:module";
import {
  type APIRequestContext,
  expect,
  type Page,
  test,
} from "@playwright/test";
import { pickDateTime } from "./helpers";

// Экраны управления, отзывов, штрафов и чёрного списка на настоящем API.
// Те же переменные, что и у live.spec.ts.
test.skip(!process.env.LIVE_API, "нужен настоящий backend");
const api = "/api/v1";
const password = "Arendo123!";

async function register(request: APIRequestContext, role: string) {
  const response = await request.post(`${api}/auth/register`, {
    data: {
      fullName: `Проверка ${role}`,
      email: `ui-${role}-${Date.now()}@arendo.test`,
      password,
      role,
    },
  });
  expect(response.status()).toBe(201);
  return response.json();
}
async function signIn(page: Page, session: unknown, path: string) {
  await page.goto("/");
  await page.evaluate(
    (s) => sessionStorage.setItem("arendo.session", JSON.stringify(s)),
    session,
  );
  await page.goto(path);
}

test("управление помещением, штраф, отзывы и чёрный список", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const owner = await register(request, "owner");
  const tenant = await register(request, "tenant");
  const title = `Проверочный зал ${Date.now()}`;
  const created = await request.post(`${api}/rooms`, {
    headers: { Authorization: `Bearer ${owner.accessToken}` },
    data: {
      categoryId: 1,
      title,
      address: "Тестовая, 2",
      areaM2: 30,
      capacity: 8,
      pricePerHour: 1000,
    },
  });
  const room = await created.json();

  await signIn(page, owner, `/owner/rooms/${room.id}`);
  await page.getByLabel("Цена за сутки, ₽").fill("6000");
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("Изменения сохранены.")).toBeVisible();
  await page.locator(".upload input").setInputFiles({
    name: "photo.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    ),
  });
  await expect(page.locator(".photo-grid figure")).toHaveCount(1);
  const from = new Date();
  from.setDate(from.getDate() + 6);
  from.setHours(10, 0, 0, 0);
  await pickDateTime(page, "Закрыто с", from);
  await pickDateTime(page, "Закрыто до", new Date(+from + 7200000));
  await page.getByLabel("Причина").fill("Уборка");
  await page.getByRole("button", { name: "Закрыть период" }).click();
  await expect(page.locator(".rows li")).toContainText("Уборка");
  await page.getByRole("button", { name: "Открыть", exact: true }).click();
  await expect(page.locator(".rows li")).toHaveCount(0);

  // Аренда создаётся через API, затем сдвигается в прошлое, чтобы получить просрочку.
  const start = new Date(Date.now() + 3 * 86400000);
  start.setMinutes(0, 0, 0);
  const booked = await request.post(`${api}/bookings`, {
    headers: { Authorization: `Bearer ${tenant.accessToken}` },
    data: {
      roomId: room.id,
      startAt: start.toISOString(),
      endAt: new Date(+start + 3600000).toISOString(),
    },
  });
  const booking = await booked.json();
  const require = createRequire(
    new URL("../../backend/package.json", import.meta.url),
  );
  const { Client } = require("pg");
  const db = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await db.connect();
  await db.query(
    "UPDATE bookings SET start_at = now() - interval '5 hours', end_at = now() - interval '3 hours' WHERE id = $1",
    [booking.id],
  );
  await db.query("UPDATE bookings SET status = 'active' WHERE id = $1", [
    booking.id,
  ]);
  await db.end();

  await page.goto("/bookings");
  await page.getByRole("button", { name: "Принять помещение" }).click();
  await page.getByRole("button", { name: "Да, принять" }).click();
  await expect(page.getByText(/Штраф за просрочку/)).toBeVisible();
  await page.getByRole("button", { name: "Оценить арендатора" }).click();
  await page.getByRole("button", { name: "Оценка 4" }).click();
  await page.getByRole("button", { name: "Отправить" }).click();
  await expect(page.getByText("Оценка сохранена.")).toBeVisible();

  await page.goto(`/tenants/${tenant.user.id}`);
  await expect(
    page.getByRole("link", { name: tenant.user.email }),
  ).toBeVisible();
  await page.getByLabel("Что сделать").selectOption("ban");
  await page.getByLabel("Причина").fill("Опоздал с возвратом");
  await page.getByRole("button", { name: "Добавить", exact: true }).click();
  await expect(
    page.getByText("В чёрном списке", { exact: true }),
  ).toBeVisible();
  await page.goto("/moderation");
  await page.getByRole("button", { name: "Снять", exact: true }).click();
  await expect(page.getByText("Записей нет.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Оплачен", exact: true }).click();
  await expect(page.locator(".rows .badge")).toHaveText("Оплачен");

  await signIn(page, tenant, "/bookings");
  await page.getByRole("button", { name: "Оставить отзыв" }).click();
  await page.getByLabel("Комментарий").fill("Хороший зал");
  await page.getByRole("button", { name: "Отправить" }).click();
  await expect(page.getByText("Отзыв сохранён.")).toBeVisible();
  await page.goto(`/rooms/${room.id}`);
  await expect(page.locator(".reviews")).toContainText("Хороший зал");
});
