import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { roomQuery, invalidateBookings } from "../query";
import { request, post, queryString } from "../api";
import type { Booking } from "../types";
import { money, date, labels, useSession, ErrorBox, State, Pager } from "../ui";
export default function Bookings() {
  const s = useSession()!;
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const data = useQuery({
    queryKey: ["bookings", s.user.id, status, page],
    queryFn: ({ signal }) =>
      request<Booking[]>(
        "/bookings?" + queryString({ status, page, pageSize: 10 }),
        { signal },
      ),
    staleTime: 15000,
  });
  return (
    <>
      <p className="eyebrow">ЛИЧНЫЙ КАБИНЕТ</p>
      <div className="section-title">
        <h1>{s.user.role === "tenant" ? "Мои аренды" : "Аренды помещений"}</h1>
        <label>
          Статус
          <select
            aria-label="Статус"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Все статусы</option>
            {Object.entries(labels).map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>
      <State query={data}>
        {data.data?.length ? (
          <div className="booking-list">
            {data.data.map((b) => (
              <BookingCard key={b.id} b={b} />
            ))}
          </div>
        ) : (
          <div className="empty">
            <h2>Здесь пока пусто</h2>
            <Link className="button" to="/">
              Найти пространство
            </Link>
          </div>
        )}
      </State>
      <Pager
        page={page}
        setPage={setPage}
        next={(data.data?.length ?? 0) === 10}
      />
    </>
  );
}
function BookingCard({ b }: { b: Booking }) {
  const s = useSession()!;
  const room = useQuery(roomQuery(b.roomId));
  const action = useMutation({
    mutationFn: (type: string) => post(`/bookings/${b.id}/${type}`),
    onSuccess: () => invalidateBookings(),
  });
  return (
    <article className="panel booking-row" data-booking-id={b.id}>
      <div>
        <span className={"badge " + b.status}>{labels[b.status]}</span>
        {b.isOverdue && <span className="error">Просрочена</span>}
        <h2>
          <Link to={`/rooms/${b.roomId}`}>
            {room.data?.title || `Помещение №${b.roomId}`}
          </Link>
        </h2>
        <p>
          {date(b.startAt)} — {date(b.endAt)}
        </p>
        <b>{money(b.totalPrice)}</b>
        {s.user.role !== "tenant" && (
          <p>
            <Link to={`/tenants/${b.tenantId}`}>
              Карточка арендатора №{b.tenantId}
            </Link>
          </p>
        )}
      </div>
      <div>
        {((b.status === "pending" && s.user.role !== "owner") ||
          (b.status === "active" && s.user.role !== "tenant")) && (
          <button
            className="secondary"
            disabled={action.isPending}
            onClick={() => {
              if (window.confirm("Отменить аренду?")) action.mutate("cancel");
            }}
          >
            Отменить аренду
          </button>
        )}
        {b.status === "active" && s.user.role !== "tenant" && (
          <button
            disabled={action.isPending}
            onClick={() => {
              if (window.confirm("Подтвердить приём помещения?"))
                action.mutate("complete");
            }}
          >
            Принять помещение
          </button>
        )}
        <ErrorBox error={action.error} />
      </div>
    </article>
  );
}
