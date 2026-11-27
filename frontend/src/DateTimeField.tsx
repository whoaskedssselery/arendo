import {
  CalendarBlankIcon,
  CaretLeftIcon,
  CaretRightIcon,
} from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { DayPicker } from "react-day-picker";
import { ru } from "react-day-picker/locale";
import "react-day-picker/style.css";

const pad = (n: number) => String(n).padStart(2, "0");
/** Локальное значение в формате datetime-local: YYYY-MM-DDTHH:mm. */
const toValue = (day: Date, hour: number) =>
  `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}T${pad(hour)}:00`;
const display = (value: string) =>
  value
    ? new Date(value).toLocaleString("ru-RU", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Выбрать";

const Chevron = ({ orientation }: { orientation?: string }) =>
  orientation === "left" ? (
    <CaretLeftIcon weight="bold" aria-hidden />
  ) : (
    <CaretRightIcon weight="bold" aria-hidden />
  );

export default function DateTimeField({
  label,
  name,
  value: controlled,
  defaultValue = "",
  onChange,
  align = "left",
}: {
  label: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  align?: "left" | "right";
}) {
  const [inner, setInner] = useState(defaultValue);
  const value = controlled ?? inner;
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const selected = value ? new Date(value) : undefined;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function change(next: string) {
    setInner(next);
    onChange?.(next);
  }

  return (
    <div className="field datetime" ref={root}>
      <span id={id}>{label}</span>
      <button
        type="button"
        ref={trigger}
        className={value ? "datetime-trigger" : "datetime-trigger placeholder"}
        aria-label={`${label}: ${display(value)}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(!open)}
      >
        {display(value)}
        <CalendarBlankIcon size={18} aria-hidden />
      </button>
      {name && <input type="hidden" name={name} value={value} />}
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-labelledby={id}
            className={`datetime-popover ${align}`}
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <DayPicker
              mode="single"
              locale={ru}
              weekStartsOn={1}
              animate
              selected={selected}
              defaultMonth={selected ?? today}
              disabled={{ before: today }}
              components={{ Chevron }}
              onSelect={(day) => {
                if (day) change(toValue(day, selected?.getHours() ?? 10));
              }}
            />
            <fieldset className="time-grid">
              <legend>Время</legend>
              {Array.from({ length: 24 }, (_, hour) => hour).map((hour) => (
                <button
                  type="button"
                  key={hour}
                  aria-pressed={selected?.getHours() === hour}
                  onClick={() => {
                    change(toValue(selected ?? today, hour));
                    setOpen(false);
                    trigger.current?.focus();
                  }}
                >
                  {pad(hour)}:00
                </button>
              ))}
            </fieldset>
            <div className="datetime-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => change("")}
              >
                Очистить
              </button>
              <button type="button" onClick={() => setOpen(false)}>
                Готово
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
