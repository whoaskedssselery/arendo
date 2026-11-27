import { MoonIcon, SunIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { type MouseEvent, useState } from "react";
import { flushSync } from "react-dom";

type Theme = "light" | "dark";
const key = "arendo.theme";

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(key);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // Хранилище недоступно: берём тему системы.
  }
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

// Тема ставится при загрузке модуля, до первой отрисовки приложения.
document.documentElement.dataset.theme = initialTheme();

export default function ThemeToggle() {
  const [theme, setTheme] = useState(
    () => (document.documentElement.dataset.theme ?? "light") as Theme,
  );
  const dark = theme === "dark";

  function toggle(e: MouseEvent<HTMLButtonElement>) {
    const next: Theme = dark ? "light" : "dark";
    const apply = () => {
      flushSync(() => setTheme(next));
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem(key, next);
      } catch {
        // Не сохранится только выбор между визитами.
      }
    };
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!document.startViewTransition || still) {
      apply();
      return;
    }
    // Новая тема расходится кругом из центра кнопки.
    const box = e.currentTarget.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const radius = Math.hypot(
      Math.max(x, innerWidth - x),
      Math.max(y, innerHeight - y),
    );
    document
      .startViewTransition(apply)
      .ready.then(() => {
        document.documentElement.animate(
          {
            clipPath: [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${radius}px at ${x}px ${y}px)`,
            ],
          },
          {
            duration: 600,
            easing: "cubic-bezier(0.65, 0, 0.35, 1)",
            pseudoElement: "::view-transition-new(root)",
          },
        );
      })
      .catch(() => {
        // Переход прерван: тема уже применена.
      });
  }

  const Icon = dark ? MoonIcon : SunIcon;
  const label = dark ? "Включить светлую тему" : "Включить тёмную тему";
  return (
    <button
      type="button"
      className="icon-button theme-toggle"
      aria-label={label}
      title={label}
      onClick={toggle}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={theme}
          initial={{ rotate: -90, scale: 0, opacity: 0 }}
          animate={{ rotate: 0, scale: 1, opacity: 1 }}
          exit={{ rotate: 90, scale: 0, opacity: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          <Icon size={20} weight="fill" aria-hidden />
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
