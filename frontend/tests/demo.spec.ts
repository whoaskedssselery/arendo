import { expect, type Page, test } from "@playwright/test";
import { pickDateTime } from "./helpers";

async function login(page: Page, role = "tenant") {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(`${role}@arendo.test`);
  await page.getByLabel("Пароль", { exact: true }).fill("Arendo123!");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page.getByRole("button", { name: "Выйти" })).toBeVisible();
}
test("каталог: поиск, пагинация, фильтры, пустое состояние", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".room-card")).toHaveCount(8);
  await page.getByRole("button", { name: "Далее", exact: true }).click();
  await expect(page.locator(".room-card")).toHaveCount(1);
  await page.getByLabel("Поиск", { exact: true }).fill("Фокус");
  await expect(page.locator(".room-card")).toHaveCount(1);
  await expect(page).toHaveURL(/q=/);
  await page.getByLabel("Поиск", { exact: true }).fill("нет такого помещения");
  await expect(page.getByText("Ничего не найдено")).toBeVisible();
  await page.getByRole("button", { name: "Сбросить фильтры" }).click();
  await expect(page.locator(".room-card")).toHaveCount(8);
  await page.getByRole("button", { name: /Фотостудии/ }).click();
  await expect(page.locator(".room-card")).toHaveCount(3);
});
test("найти → арендовать → отменить; календарь обновляется", async ({
  page,
}) => {
  await login(page);
  await page.goto("/rooms/1");
  await expect(
    page.getByRole("heading", { name: "Календарь занятости" }),
  ).toBeVisible();
  const start = new Date();
  start.setDate(start.getDate() + 4);
  start.setHours(10, 0, 0, 0);
  const end = new Date(+start + 3600000);
  await pickDateTime(page, "Начало аренды", start);
  await pickDateTime(page, "Окончание аренды", end);
  await page.getByRole("button", { name: "Арендовать", exact: true }).click();
  await expect(page).toHaveURL(/bookings/);
  const booking = page.locator(".booking-row").last();
  await expect(booking.getByText("Ожидает", { exact: true })).toBeVisible();
  await booking.getByRole("button", { name: "Отменить аренду" }).click();
  await page.getByRole("button", { name: "Да, отменить" }).click();
  await expect(booking.getByText("Отменено", { exact: true })).toBeVisible();
  await expect(
    booking.getByRole("button", { name: "Отменить аренду" }),
  ).toHaveCount(0);
});
test("владелец: помещения, приёмка и карточка арендатора", async ({ page }) => {
  await login(page, "owner");
  await expect(
    page.getByRole("heading", { name: "Кабинет владельца" }),
  ).toBeVisible();
  await expect(page.locator(".room-card")).toHaveCount(8);
  await page.getByRole("link", { name: "Аренды и приёмка" }).click();
  const active = page
    .locator(".booking-row")
    .filter({ hasText: "Лофт «Свет»" })
    .first();
  await active.getByRole("link", { name: "Карточка арендатора №1" }).click();
  await expect(
    page.getByRole("heading", { name: "Анна Соколова" }),
  ).toBeVisible();
  await page.goBack();
  await active.getByRole("button", { name: "Принять помещение" }).click();
  await page.getByRole("button", { name: "Да, принять" }).click();
  await expect(active.getByText("Завершено", { exact: true })).toBeVisible();
});
test("регистрация арендатора и защита роли", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Имя и фамилия").fill("Новый Пользователь");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`new${Date.now()}@test.test`);
  await page.getByLabel("Пароль", { exact: true }).fill("Password123!");
  await page.getByRole("button", { name: "Зарегистрироваться" }).click();
  await expect(page.getByRole("heading", { name: "Мои аренды" })).toBeVisible();
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Нет доступа" }),
  ).toBeVisible();
});
test("администратор блокирует и разблокирует пользователя", async ({
  page,
}) => {
  await login(page, "admin");
  const row = page.getByRole("row").filter({ hasText: "tenant@arendo.test" });
  await row.getByRole("button", { name: "Заблокировать", exact: true }).click();
  await page.getByRole("button", { name: "Да, заблокировать" }).click();
  await expect(row.getByText("Заблокирован", { exact: true })).toBeVisible();
  await row
    .getByRole("button", { name: "Разблокировать", exact: true })
    .click();
  await page.getByRole("button", { name: "Да, разблокировать" }).click();
  await expect(row.getByText("Активен", { exact: true })).toBeVisible();
});
test("адаптив 360–1440 и отсутствие ошибок JavaScript", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/", "/rooms/1", "/login", "/register"]) {
      await page.goto(path);
      await expect(page.locator("h1")).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBeTruthy();
    }
  }
  expect(errors).toEqual([]);
});
