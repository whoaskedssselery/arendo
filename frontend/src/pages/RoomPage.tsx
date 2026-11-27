import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { roomQuery, invalidateBookings } from "../query";
import { request, post, queryString } from "../api";
import type { Booking, Room, Slot } from "../types";
import {
  RoomPhoto,
  money,
  date,
  useSession,
  ErrorBox,
  State,
  Field,
} from "../ui";
export default function RoomPage() {
  const id = Number(useParams().id);
  const room = useQuery(roomQuery(id));
  return (
    <State query={room}>{room.data && <RoomDetail room={room.data} />}</State>
  );
}
function RoomDetail({ room: r }: { room: Room }) {
  const s = useSession();
  const nav = useNavigate();
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const from = month.toISOString(),
    to = new Date(month.getFullYear(), month.getMonth() + 1, 1).toISOString();
  const cal = useQuery({
    queryKey: ["calendar", r.id, from, to],
    queryFn: ({ signal }) =>
      request<Slot[]>(`/rooms/${r.id}/calendar?` + queryString({ from, to }), {
        signal,
      }),
    staleTime: 15000,
  });
  const [error, setError] = useState<unknown>();
  const [period, setPeriod] = useState({ startAt: "", endAt: "" });
  const mutation = useMutation({
    mutationFn: (body: unknown) => post<Booking>("/bookings", body),
    onSuccess: async () => {
      await invalidateBookings();
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
  async function book(e: FormEvent) {
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
    <>
      <Link className="back" to="/">
        Каталог пространств
      </Link>
      <div className="section-title">
        <div>
          <h1>{r.title}</h1>
          <p>{r.address}</p>
        </div>
        <span>
          ★ {r.avgRating ?? "Пока нет оценок"} · {r.reviewsCount} отзывов
        </span>
      </div>
      <RoomPhoto
        className="detail-photo"
        url={r.photos.find((p) => p.isMain)?.url || r.photos[0]?.url}
        title={r.title}
      />
      <div className="detail-grid">
        <div>
          <div className="panel">
            <h2>Место для ваших идей</h2>
            <div className="meta">
              <span>{r.areaM2} м²</span>
              <span>До {r.capacity} гостей</span>
            </div>
            <p>{r.description || "Описание пока не добавлено."}</p>
          </div>
          <section className="panel">
            <div className="section-title">
              <h2>Календарь занятости</h2>
              <div className="inline">
                <button
                  aria-label="Предыдущий месяц"
                  onClick={() =>
                    setMonth(
                      new Date(month.getFullYear(), month.getMonth() - 1, 1),
                    )
                  }
                >
                  ‹
                </button>
                <b>
                  {month.toLocaleDateString("ru-RU", {
                    month: "long",
                    year: "numeric",
                  })}
                </b>
                <button
                  aria-label="Следующий месяц"
                  onClick={() =>
                    setMonth(
                      new Date(month.getFullYear(), month.getMonth() + 1, 1),
                    )
                  }
                >
                  ›
                </button>
              </div>
            </div>
            <p>
              Часовой пояс устройства:{" "}
              {Intl.DateTimeFormat().resolvedOptions().timeZone}. На день можно
              нажать, чтобы выбрать начало.
            </p>
            <State query={cal}>
              <div className="calendar">
                {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d) => (
                  <span className="weekday" key={d}>
                    {d}
                  </span>
                ))}
                {Array.from({ length: (month.getDay() + 6) % 7 }, (_, i) => (
                  <span key={"blank" + i} />
                ))}
                {Array.from(
                  {
                    length: new Date(
                      month.getFullYear(),
                      month.getMonth() + 1,
                      0,
                    ).getDate(),
                  },
                  (_, i) => {
                    const day = new Date(
                      month.getFullYear(),
                      month.getMonth(),
                      i + 1,
                    );
                    const end = new Date(
                      month.getFullYear(),
                      month.getMonth(),
                      i + 2,
                    );
                    const busy =
                      cal.data?.filter(
                        (b) =>
                          new Date(b.startAt) < end && new Date(b.endAt) > day,
                      ) || [];
                    return (
                      <button
                        className={busy.length ? "busy" : ""}
                        key={i}
                        title={
                          busy
                            .map((b) => `${date(b.startAt)} — ${date(b.endAt)}`)
                            .join("\n") || "Свободно"
                        }
                        onClick={() => {
                          const local = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
                          setPeriod({
                            startAt: local + "T10:00",
                            endAt: local + "T11:00",
                          });
                        }}
                      >
                        {i + 1}
                        <small>{busy.length ? "Есть бронь" : "Свободно"}</small>
                      </button>
                    );
                  },
                )}
              </div>
              <p className="legend">
                Зелёный — свободно · Жёлтый — есть занятые часы
              </p>
              {cal.data?.length ? (
                <ul className="slots">
                  {cal.data.map((b, i) => (
                    <li key={i}>
                      {date(b.startAt)} — {date(b.endAt)} ·{" "}
                      {b.kind === "block" ? "Закрыто" : "Занято"}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>В этом месяце занятых интервалов нет.</p>
              )}
            </State>
          </section>
        </div>
        <aside className="panel booking">
          <h2>
            {money(r.pricePerHour)} <small>/ час</small>
          </h2>
          {r.pricePerDay && <p>{money(r.pricePerDay)} / сутки</p>}
          <form onSubmit={book}>
            <Field
              label="Начало аренды"
              type="datetime-local"
              required
              value={period.startAt}
              onChange={(e) =>
                setPeriod({ ...period, startAt: e.target.value })
              }
            />
            <Field
              label="Окончание аренды"
              type="datetime-local"
              required
              value={period.endAt}
              onChange={(e) => setPeriod({ ...period, endAt: e.target.value })}
            />
            {estimate > 0 && (
              <p>
                Предварительная стоимость: <b>{money(estimate)}</b>
              </p>
            )}
            <ErrorBox error={error || mutation.error} />
            {!s || s.user.role === "tenant" ? (
              <button disabled={mutation.isPending}>
                {mutation.isPending
                  ? "Бронируем…"
                  : s
                    ? "Арендовать"
                    : "Войти и арендовать"}
              </button>
            ) : (
              <p>Бронирование доступно в аккаунте арендатора.</p>
            )}
            <small>Итоговую стоимость и доступность проверяет сервер.</small>
          </form>
        </aside>
      </div>
    </>
  );
}
