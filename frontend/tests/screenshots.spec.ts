import { expect, test } from "@playwright/test";

test.skip(
  !!process.env.LIVE_API,
  "Галерея макетов снимается в явно включённом деморежиме",
);
test("галерея экранов для согласования с тимлидом", async ({ page }) => {
  async function shot(name: string) {
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        [...document.images].map((i) => i.decode().catch(() => {})),
      );
    });
    await page.screenshot({
      path: `../docs/frontend/screenshots/${name}.png`,
      fullPage: true,
    });
  }
  async function login(role: string) {
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(`${role}@arendo.test`);
    await page.getByLabel("Пароль", { exact: true }).fill("Arendo123!");
    await page.getByRole("button", { name: "Войти", exact: true }).click();
    await expect(page.getByRole("button", { name: "Выйти" })).toBeVisible();
  }
  await page.goto("/");
  await expect(page.locator(".room-card")).toHaveCount(8);
  await shot("catalog-desktop");
  await page.goto("/rooms/1");
  await expect(
    page.getByRole("heading", { name: "Календарь занятости" }),
  ).toBeVisible();
  await expect(page.locator(".calendar button")).toHaveCount(
    new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate(),
  );
  await shot("room-desktop");
  await page.goto("/login");
  await shot("login");
  await page.goto("/register");
  await shot("register");
  await login("tenant");
  await expect(page.locator(".booking-row")).toHaveCount(2);
  await expect(page.locator(".booking-row").first()).toContainText(
    "Лофт «Свет»",
  );
  await shot("bookings-desktop");
  await login("owner");
  await expect(page.locator(".room-card")).toHaveCount(8);
  await shot("owner-desktop");
  await page.goto("/tenants/1");
  await expect(
    page.getByRole("heading", { name: "Анна Соколова" }),
  ).toBeVisible();
  await shot("tenant-desktop");
  await login("admin");
  await expect(page.locator("tbody tr")).toHaveCount(3);
  await shot("admin-desktop");
  await page.getByRole("button", { name: "Выйти" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".room-card")).toHaveCount(8);
  await shot("catalog-mobile");
  await page.goto("/rooms/1");
  await expect(page.locator(".calendar button").first()).toBeVisible();
  await shot("room-mobile");
});
