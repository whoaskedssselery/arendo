import React from "react";
import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { client, roomQuery } from "./query";
import { getSession } from "./api";
import type { Room, Role } from "./types";
import { roomImages } from "./images";
export const money = (n: number) =>
  new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(n);
export const date = (s: string) =>
  new Date(s).toLocaleString("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  });
export const labels = {
  pending: "Ожидает",
  active: "Активно",
  completed: "Завершено",
  cancelled: "Отменено",
};
export function useSession() {
  const [s, update] = useState(getSession());
  useEffect(() => {
    const fn = () => update(getSession());
    window.addEventListener("session", fn);
    return () => window.removeEventListener("session", fn);
  }, []);
  return s;
}
export function ErrorBox({ error }: { error: unknown }) {
  return error ? (
    <p role="alert" className="error">
      {error instanceof Error ? error.message : "Не удалось загрузить данные."}
    </p>
  ) : null;
}
export function State({
  query,
  children,
}: {
  query: { isPending: boolean; error: unknown; refetch: () => unknown };
  children: React.ReactNode;
}) {
  if (query.isPending)
    return (
      <p role="status" className="empty">
        Загружаем данные…
      </p>
    );
  if (query.error)
    return (
      <div className="panel">
        <ErrorBox error={query.error} />
        <button onClick={() => query.refetch()}>Повторить</button>
      </div>
    );
  return children;
}
export function Field({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label>
      {label}
      <input {...props} />
    </label>
  );
}
export function Protect({
  roles,
  children,
}: {
  roles: Role[];
  children: React.ReactNode;
}) {
  const s = useSession();
  if (!s) return <Navigate to="/login" replace />;
  return roles.includes(s.user.role) ? (
    children
  ) : (
    <div className="panel">
      <h1>Нет доступа</h1>
      <p>Эта страница недоступна для вашей роли.</p>
      <Link to="/">Открыть каталог</Link>
    </div>
  );
}
export function RoomCard({ room: r }: { room: Room }) {
  return (
    <Link
      className="room-card"
      to={`/rooms/${r.id}`}
      onMouseEnter={() => client.prefetchQuery(roomQuery(r.id))}
      onFocus={() => client.prefetchQuery(roomQuery(r.id))}
    >
      <RoomPhoto
        className="photo"
        url={r.photos.find((p) => p.isMain)?.url || r.photos[0]?.url}
        title={r.title}
        lazy
      >
        <span className="rating">★ {r.avgRating ?? "Новый"}</span>
      </RoomPhoto>
      <div className="card-body">
        <h3>{r.title}</h3>
        <p>{r.address}</p>
        <div className="meta">
          <span>{r.areaM2} м²</span>
          <span>до {r.capacity} гостей</span>
        </div>
        <div className="card-bottom">
          <b>
            {money(r.pricePerHour)} <small>/ час</small>
          </b>
          <span>Подробнее</span>
        </div>
      </div>
    </Link>
  );
}
export function Pager({
  page,
  setPage,
  next,
}: {
  page: number;
  setPage: (n: number) => void;
  next: boolean;
}) {
  return (
    <div className="pagination">
      <button disabled={page === 1} onClick={() => setPage(page - 1)}>
        Назад
      </button>
      <span>Страница {page}</span>
      <button disabled={!next} onClick={() => setPage(page + 1)}>
        Далее
      </button>
    </div>
  );
}

export function RoomPhoto({
  url,
  title,
  className,
  lazy = false,
  children,
}: {
  url?: string;
  title: string;
  className: string;
  lazy?: boolean;
  children?: React.ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  const placeholder = !url || failed;
  return (
    <div className={className + " room-photo"}>
      <img
        src={placeholder ? roomImages[0] : url}
        alt={placeholder ? "Иллюстрация пространства" : title}
        loading={lazy ? "lazy" : "eager"}
        onError={() => {
          if (!failed) setFailed(true);
        }}
      />
      {placeholder && (
        <span className="photo-note">
          Иллюстрация · фото помещения пока нет
        </span>
      )}
      {children}
    </div>
  );
}
