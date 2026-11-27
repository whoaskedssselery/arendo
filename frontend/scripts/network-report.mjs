import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const directory = new URL("../../docs/frontend/", import.meta.url);
const evidence = JSON.parse(
  await readFile(new URL("network-cache.json", directory), "utf8"),
);
const escapeHtml = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const browser = await chromium.launch({ channel: "chromium" });
try {
  for (const [name, title, rows] of [
    ["before", "Первое открытие", evidence.coldRequests],
    ["after", "Повторное открытие", evidence.warmRequests],
  ]) {
    const html = `<!doctype html><html lang="ru"><meta charset="utf-8"><title>Network: ${title}</title><style>body{font:18px Arial;color:#173e35;background:#f4f6f3;padding:45px}h1{font-size:38px}p{line-height:1.6}table{border-collapse:collapse;width:100%;background:white}td,th{text-align:left;padding:18px;border-bottom:1px solid #d8e2dc}td:last-child{font-family:monospace;font-size:15px;word-break:break-all}.count{background:#173e35;color:white;border-radius:12px;padding:25px;font-size:30px}.note{color:#526b60;font-size:15px}</style><h1>Network · ${title}</h1><p>Каталог → карточка → каталог → та же карточка.<br>Production-сборка React + настоящий NestJS + PostgreSQL.</p><p class="count">Новых HTTP-запросов: ${rows.length}</p><table><tr><th>Метод</th><th>URL</th></tr>${rows.map((path) => `<tr><td>GET</td><td>${escapeHtml(decodeURIComponent(path))}</td></tr>`).join("") || '<tr><td colspan="2">Запросов нет — данные получены из свежего TanStack Query cache.</td></tr>'}</table><p>Карточка: ${escapeHtml(evidence.room)}. staleTime: категории — 1 час, каталог — 45 с,<br>карточка — 3 мин, календарь — 15 с.</p><p class="note">Экспорт событий запросов Playwright. Исходные измерения: network-cache.json.<br>Сравнение холодного и повторного просмотра, не скриншот DevTools.</p></html>`;
    const file = new URL(`network-${name}.html`, directory);
    await writeFile(file, html);
    const page = await browser.newPage({
      viewport: { width: 1200, height: 850 },
    });
    await page.goto(`file://${fileURLToPath(file)}`);
    await page.screenshot({
      path: fileURLToPath(
        new URL(`screenshots/network-${name}.png`, directory),
      ),
      fullPage: true,
    });
    await page.close();
  }
} finally {
  await browser.close();
}
