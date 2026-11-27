import type { Page } from "@playwright/test";

/** Выбор даты и часа в нашем календаре. */
export async function pickDateTime(page: Page, label: string, at: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  await page.getByRole("button", { name: new RegExp(`^${label}:`) }).click();
  const popover = page.getByRole("dialog", { name: label });
  const day = popover.locator(
    `td[data-day="${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}"]:not([data-outside]) button`,
  );
  for (let month = 0; month < 2 && !(await day.isVisible()); month++)
    await popover.locator(".rdp-button_next").click();
  await day.click();
  await popover
    .getByRole("button", { name: `${pad(at.getHours())}:00`, exact: true })
    .click();
  await popover.waitFor({ state: "hidden" });
}
