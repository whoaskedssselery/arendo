import {
  ArrowLeftIcon,
  CalendarBlankIcon,
  CaretLeftIcon,
  CaretRightIcon,
  MapPinIcon,
  RulerIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { post, queryString, request } from "../api";
import DateTimeField from "../DateTimeField";
import { invalidateBookings, roomQuery } from "../query";
import { ReviewList } from "../Reviews";
import type { Booking, Room, Slot } from "../types";
import {
  date,
  ErrorBox,
  mainPhoto,
  money,
  Rating,
  RoomPhoto,
  State,
  useSession,
} from "../ui";

const pad = (n: number) => String(n).padStart(2, "0");
const toInput = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const atHour = (day: Date, hour: number) =>
  new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour);
const overlaps = (slot: Slot, from: Date, to: Date) =>
  new Date(slot.startAt) < to && new Date(slot.endAt) > from;
const stateNames = {
  free: "свободно",
  selected: "выбрано",
  pending: "ожидает",
  busy: "занято",
  closed: "закрыто",
  past: "прошло",
};
type HourState = keyof typeof stateNames;

interface Period {
  startAt: string;
  endAt: string;
}

export default function RoomPage() {
  const id = Number(useParams().id);
  const room = useQuery(roomQuery(id));
  return (
    <State query={room}>{room.data && <RoomDetail room={room.data} />}</State>
  );
}

function RoomDetail({ room: r }: { room: Room }) {
  const [period, setPeriod] = useState<Period>({ startAt: "", endAt: "" });
  return (
    <>
      <Link className="back" to="/">
        <ArrowLeftIcon weight="bold" aria-hidden />
        Каталог пространств
      </Link>
      <h1>{r.title}</h1>
      <p className="detail-sub">
        {r.avgRating == null ? (
          <span className="new-badge">Новое</span>
        ) : (
          <span>
            <Rating value={r.avgRating} />· отзывов: {r.reviewsCount}
          </span>
        )}
        <span>
          <MapPinIcon aria-hidden />
          {r.address}
        </span>
      </p>
      <RoomPhoto
        className="detail-photo"
        url={mainPhoto(r)}
        title={r.title}
        seed={r.id}
      />
      <div className="detail-grid">
        <div className="detail-main">
          <section className="block">
            <h2>О помещении</h2>
            <ul className="facts">
              <li>
                <RulerIcon size={24} aria-hidden />
                {r.areaM2} м²
              </li>
              <li>
                <UsersThreeIcon size={24} aria-hidden />
                До {r.capacity} гостей
              </li>
              {r.pricePerDay && (
                <li>
                  <CalendarBlankIcon size={24} aria-hidden />
                  {money(r.pricePerDay)} за сутки
                </li>
              )}
            </ul>
            <p>{r.description || "Описание пока не добавлено."}</p>
          </section>
          {r.photos.length > 1 && (
            <div className="gallery">
              {r.photos.map((p) => (
                <RoomPhoto
                  key={p.id}
                  className="tile"
                  url={p.url}
                  title={r.title}
                  seed={p.id}
                  lazy
                />
              ))}
            </div>
          )}
          <Availability room={r} period={period} setPeriod={setPeriod} />
          <ReviewList roomId={r.id} />
        </div>
        <BookingForm room={r} period={period} setPeriod={setPeriod} />
      </div>
    </>
  );
}

function Availability({
  room: r,
  period,
  setPeriod,
}: {
  room: Room;
  period: Period;
  setPeriod: (period: Period) => void;
}) {
  const today = atHour(new Date(), 0);
  const [month, setMonth] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [day, setDay] = useState(today);
  const from = month.toISOString(),
    to = new Date(month.getFullYear(), month.getMonth() + 1, 1).toISOString();
  const cal = useQuery({
    queryKey: ["calendar", r.id, from, to],
    queryFn: ({ signal }) =>
      request<Slot[]>(`/rooms/${r.id}/calendar?${queryString({ from, to })}`, {
        signal,
      }),
    staleTime: 15000,
  });
  const slots = cal.data ?? [];
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const wholeDay = (d: Date, slot: Slot) =>
    overlaps(slot, d, new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1));
  const daySlots = slots.filter((s) => wholeDay(day, s));
  const start = period.startAt ? new Date(period.startAt) : undefined;
  const end = period.endAt ? new Date(period.endAt) : undefined;

  function hourState(hour: number): HourState {
    const a = atHour(day, hour),
      b = atHour(day, hour + 1);
    const slot = daySlots.find((s) => overlaps(s, a, b));
    if (slot) {
      if (slot.kind === "block") return "closed";
      return slot.status === "pending" ? "pending" : "busy";
    }
    if (a <= new Date()) return "past";
    return start && end && start < b && end > a ? "selected" : "free";
  }

  // Первый клик задаёт начало, второй (позже) — конец, если между ними свободно.
  function pick(hour: number) {
    const extend =
      start &&
      end &&
      +end - +start === 3600000 &&
      start.toDateString() === day.toDateString() &&
      hour > start.getHours() &&
      Array.from(
        { length: hour - start.getHours() + 1 },
        (_, i) => start.getHours() + i,
      ).every((h) => ["free", "selected"].includes(hourState(h)));
    setPeriod({
      startAt: extend ? period.startAt : toInput(atHour(day, hour)),
      endAt: toInput(atHour(day, hour + 1)),
    });
  }

  function shift(step: number) {
    const next = new Date(month.getFullYear(), month.getMonth() + step, 1);
    setMonth(next);
    const current =
      next.getMonth() === today.getMonth() &&
      next.getFullYear() === today.getFullYear();
    setDay(current ? today : next);
  }

  return (
    <section className="block">
      <div className="block-head">
        <h2>Календарь занятости</h2>
        <div className="month">
          <button
            type="button"
            className="icon-button"
            aria-label="Предыдущий месяц"
            onClick={() => shift(-1)}
          >
            <CaretLeftIcon weight="bold" aria-hidden />
          </button>
          <b>
            {month.toLocaleDateString("ru-RU", {
              month: "long",
              year: "numeric",
            })}
          </b>
          <button
            type="button"
            className="icon-button"
            aria-label="Следующий месяц"
            onClick={() => shift(1)}
          >
            <CaretRightIcon weight="bold" aria-hidden />
          </button>
        </div>
      </div>
      <State query={cal}>
        <div className="calendar">
          {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((name) => (
            <span className="weekday" key={name}>
              {name}
            </span>
          ))}
          {Array.from(
            { length: (month.getDay() + 6) % 7 },
            (_, i) => `blank-${i}`,
          ).map((key) => (
            <span key={key} />
          ))}
          {Array.from(
            { length: days },
            (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1),
          ).map((d) => {
            const busy = slots.some((s) => wholeDay(d, s));
            return (
              <button
                type="button"
                key={d.getDate()}
                className={[busy ? "busy" : "", d < today ? "past" : ""]
                  .join(" ")
                  .trim()}
                aria-pressed={d.toDateString() === day.toDateString()}
                aria-label={`${d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}: ${busy ? "есть занятые часы" : "свободно"}`}
                onClick={() => setDay(d)}
              >
                {d.getDate()}
              </button>
            );
          })}
        </div>
        <h3>
          Часы на{" "}
          {day.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}
        </h3>
        <div className="hours">
          {Array.from({ length: 24 }, (_, hour) => hour).map((hour) => {
            const state = hourState(hour);
            return (
              <button
                type="button"
                key={hour}
                className={`hour ${state}`}
                disabled={state !== "free" && state !== "selected"}
                aria-label={`${pad(hour)}:00, ${stateNames[state]}`}
                onClick={() => pick(hour)}
              >
                {pad(hour)}:00
              </button>
            );
          })}
        </div>
        <p className="legend">
          {(
            ["free", "selected", "pending", "busy", "closed", "past"] as const
          ).map((key) => (
            <span key={key}>
              <i className={`hour ${key}`} />
              {stateNames[key]}
            </span>
          ))}
        </p>
        {daySlots.length > 0 && (
          <ul className="slots">
            {daySlots.map((s) => (
              <li key={`${s.kind}-${s.startAt}`}>
                {date(s.startAt)} — {date(s.endAt)} ·{" "}
                {s.kind === "block" ? "Закрыто" : "Занято"}
              </li>
            ))}
          </ul>
        )}
      </State>
    </section>
  );
}

function BookingForm({
  room: r,
  period,
  setPeriod,
}: {
  room: Room;
  period: Period;
  setPeriod: (period: Period) => void;
}) {
  const s = useSession();
  const nav = useNavigate();
  const [error, setError] = useState<unknown>();
  const mutation = useMutation({
    mutationFn: (body: unknown) => post<Booking>("/bookings", body),
    onSuccess: async () => {
      await invalidateBookings();
      toast.success("Аренда создана и ждёт начала.");
      nav("/bookings");
    },
  });
  const hours = Math.ceil(
    (+new Date(period.endAt) - +new Date(period.startAt)) / 3600000,
  );
  const estimate =
    hours > 0
      ? Math.min(
          hours * r.pricePerHour,
          Math.ceil(hours / 24) * (r.pricePerDay || Infinity),
        )
      : 0;
  function book(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    const start = new Date(period.startAt),
      end = new Date(period.endAt);
    if (
      start <= new Date() ||
      !(end > start) ||
      +end - +start > 30 * 86400000
    ) {
      setError(new Error("Выберите будущий период длительностью до 30 суток."));
      return;
    }
    if (!s) {
      nav("/login");
      return;
    }
    mutation.mutate({
      roomId: r.id,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
    });
  }
  return (
    <aside className="booking">
      <p className="booking-price">
        <b>{money(r.pricePerHour)}</b> в час
      </p>
      <form onSubmit={book}>
        <DateTimeField
          label="Начало аренды"
          value={period.startAt}
          onChange={(startAt) => setPeriod({ ...period, startAt })}
        />
        <DateTimeField
          label="Окончание аренды"
          value={period.endAt}
          onChange={(endAt) => setPeriod({ ...period, endAt })}
        />
        {estimate > 0 && (
          <p className="total">
            <span>Примерно за {hours} ч</span>
            <b>{money(estimate)}</b>
          </p>
        )}
        <ErrorBox error={error || mutation.error} />
        {!s || s.user.role === "tenant" ? (
          <button type="submit" className="wide" disabled={mutation.isPending}>
            {mutation.isPending
              ? "Бронируем…"
              : s
                ? "Арендовать"
                : "Войти и арендовать"}
          </button>
        ) : (
          <p>Бронирование доступно в аккаунте арендатора.</p>
        )}
      </form>
    </aside>
  );
}
