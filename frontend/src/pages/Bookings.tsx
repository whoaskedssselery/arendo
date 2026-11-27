import { CalendarXIcon, ClockIcon, UserIcon } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { post, queryString, request } from "../api";
import { invalidateBookings, roomQuery } from "../query";
import type { Booking } from "../types";
import {
  ConfirmButton,
  date,
  ErrorBox,
  labels,
  mainPhoto,
  money,
  Pager,
  RoomPhoto,
  State,
  StatusBadge,
  useRequiredSession,
} from "../ui";

export default function Bookings() {
  const s = useRequiredSession();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const data = useQuery({
    queryKey: ["bookings", s.user.id, status, page],
    queryFn: ({ signal }) =>
      request<Booking[]>(
        `/bookings?${queryString({ status, page, pageSize: 10 })}`,
        { signal },
      ),
    staleTime: 15000,
  });
  return (
    <>
      <h1>{s.user.role === "tenant" ? "Мои аренды" : "Аренды помещений"}</h1>
      <fieldset className="tabs">
        <legend className="sr-only">Статус</legend>
        {[["", "Все"], ...Object.entries(labels)].map(([value, text]) => (
          <button
            type="button"
            key={value || "all"}
            aria-pressed={status === value}
            onClick={() => {
              setStatus(value);
              setPage(1);
            }}
          >
            {text}
            {status === value && (
              <motion.i className="underline" layoutId="tab-line" />
            )}
          </button>
        ))}
      </fieldset>
      <State query={data} skeleton="rows">
        {data.data?.length ? (
          <div className="booking-list">
            {data.data.map((b) => (
              <BookingCard key={b.id} b={b} />
            ))}
          </div>
        ) : (
          <div className="empty">
            <CalendarXIcon size={40} aria-hidden />
            <h2>Здесь пока пусто</h2>
            <p>Выберите помещение и время в каталоге.</p>
            <Link className="button" to="/">
              Найти помещение
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
  const s = useRequiredSession();
  const room = useQuery(roomQuery(b.roomId));
  const action = useMutation({
    mutationFn: (type: "cancel" | "complete") =>
      post(`/bookings/${b.id}/${type}`),
    onSuccess: async (_, type) => {
      toast.success(
        type === "cancel" ? "Аренда отменена." : "Помещение принято.",
      );
      await invalidateBookings();
    },
  });
  const canCancel =
    (b.status === "pending" && s.user.role !== "owner") ||
    (b.status === "active" && s.user.role !== "tenant");
  const title = room.data?.title || `Помещение №${b.roomId}`;
  return (
    <article className="booking-row" data-booking-id={b.id}>
      <RoomPhoto
        className="thumb"
        url={room.data && mainPhoto(room.data)}
        title={title}
        seed={b.roomId}
        lazy
      />
      <div className="booking-info">
        <h2>
          <Link to={`/rooms/${b.roomId}`}>{title}</Link>
        </h2>
        <p>
          <ClockIcon aria-hidden />
          {date(b.startAt)} — {date(b.endAt)}
        </p>
        {s.user.role !== "tenant" && (
          <p>
            <UserIcon aria-hidden />
            <Link className="text-link" to={`/tenants/${b.tenantId}`}>
              Карточка арендатора №{b.tenantId}
            </Link>
          </p>
        )}
        <b>{money(b.totalPrice)}</b>
      </div>
      <div className="booking-side">
        <StatusBadge status={b.status} />
        {b.isOverdue && <span className="badge overdue">Просрочена</span>}
        {canCancel && (
          <ConfirmButton
            className="secondary"
            disabled={action.isPending}
            title="Отменить аренду?"
            text={`${title}, ${date(b.startAt)}. Вернуть отменённую аренду нельзя.`}
            confirmLabel="Да, отменить"
            onConfirm={() => action.mutate("cancel")}
          >
            Отменить аренду
          </ConfirmButton>
        )}
        {b.status === "active" && s.user.role !== "tenant" && (
          <ConfirmButton
            disabled={action.isPending}
            title="Принять помещение?"
            text="Аренда завершится. Если срок прошёл, начислится штраф."
            confirmLabel="Да, принять"
            onConfirm={() => action.mutate("complete")}
          >
            Принять помещение
          </ConfirmButton>
        )}
        <ErrorBox error={action.error} />
      </div>
    </article>
  );
}
