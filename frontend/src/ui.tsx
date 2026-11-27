import {
  CaretLeftIcon,
  CaretRightIcon,
  CheckCircleIcon,
  ClockIcon,
  EyeIcon,
  EyeSlashIcon,
  PlayCircleIcon,
  RulerIcon,
  StarIcon,
  UsersThreeIcon,
  WarningCircleIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { motion } from "motion/react";
import type React from "react";
import { useEffect, useId, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { getSession } from "./api";
import { photoFor } from "./images";
import { client, roomQuery } from "./query";
import type { Booking, Role, Room } from "./types";

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
export const roleLabels: Record<Role, string> = {
  tenant: "Арендатор",
  owner: "Владелец",
  admin: "Администратор",
};
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

const statusIcons = {
  pending: ClockIcon,
  active: PlayCircleIcon,
  completed: CheckCircleIcon,
  cancelled: XCircleIcon,
};
export function StatusBadge({ status }: { status: Booking["status"] }) {
  const Icon = statusIcons[status];
  return (
    <span className={`badge ${status}`}>
      <Icon weight="fill" aria-hidden />
      {labels[status]}
    </span>
  );
}

export function useSession() {
  const [s, update] = useState(getSession());
  useEffect(() => {
    const fn = () => update(getSession());
    window.addEventListener("session", fn);
    return () => window.removeEventListener("session", fn);
  }, []);
  return s;
}
export function useRequiredSession() {
  const session = useSession();
  if (!session) throw new Error("Требуется вход в аккаунт.");
  return session;
}

export function ErrorBox({ error }: { error: unknown }) {
  return error ? (
    <p role="alert" className="error">
      <WarningCircleIcon weight="fill" aria-hidden />
      {error instanceof Error ? error.message : "Не удалось загрузить данные."}
    </p>
  ) : null;
}

const skeletonCount = { block: 1, rows: 3, cards: 8 };
export function State({
  query,
  children,
  skeleton = "block",
}: {
  query: { isPending: boolean; error: unknown; refetch: () => unknown };
  children: React.ReactNode;
  skeleton?: keyof typeof skeletonCount;
}) {
  if (query.isPending)
    return (
      <div role="status" className={`skeletons ${skeleton}`}>
        <span className="sr-only">Загружаем данные…</span>
        {Array.from(
          { length: skeletonCount[skeleton] },
          (_, i) => `skeleton-${i}`,
        ).map((key) => (
          <div className="skeleton" key={key} />
        ))}
      </div>
    );
  if (query.error)
    return (
      <div className="panel">
        <ErrorBox error={query.error} />
        <button type="button" onClick={() => query.refetch()}>
          Повторить
        </button>
      </div>
    );
  return children;
}

export function Field({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="field">
      {label}
      <input {...props} />
    </label>
  );
}

export function PasswordField({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  const Icon = visible ? EyeSlashIcon : EyeIcon;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="password">
        <input {...props} id={id} type={visible ? "text" : "password"} />
        <button
          type="button"
          className="icon-button"
          aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
        >
          <Icon size={20} aria-hidden />
        </button>
      </div>
    </div>
  );
}

export function ConfirmButton({
  children,
  title,
  text,
  confirmLabel,
  onConfirm,
  className,
  disabled,
}: {
  children: React.ReactNode;
  title: string;
  text: string;
  confirmLabel: string;
  onConfirm: () => void;
  className?: string;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        type="button"
        className={className}
        disabled={disabled}
        onClick={() => ref.current?.showModal()}
      >
        {children}
      </button>
      <dialog ref={ref} className="dialog">
        <h2>{title}</h2>
        <p>{text}</p>
        <div className="dialog-actions">
          <button
            type="button"
            className="secondary"
            onClick={() => ref.current?.close()}
          >
            Не сейчас
          </button>
          <button
            type="button"
            onClick={() => {
              ref.current?.close();
              onConfirm();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </dialog>
    </>
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
    <div className="empty">
      <h1>Нет доступа</h1>
      <p>Эта страница недоступна для вашей роли.</p>
      <Link className="button" to="/">
        Открыть каталог
      </Link>
    </div>
  );
}

export function RoomPhoto({
  url,
  title,
  className,
  seed = 0,
  lazy = false,
  children,
}: {
  url?: string;
  title: string;
  className: string;
  seed?: number;
  lazy?: boolean;
  children?: React.ReactNode;
}) {
  const [failedUrl, setFailedUrl] = useState<string>();
  const failed = url !== undefined && failedUrl === url;
  const placeholder = !url || failed;
  return (
    <div className={`${className} room-photo`}>
      <img
        src={placeholder ? photoFor(title, seed) : url}
        alt={placeholder ? "Иллюстрация пространства" : title}
        loading={lazy ? "lazy" : "eager"}
        onError={() => {
          if (!failed) setFailedUrl(url);
        }}
      />
      {children}
    </div>
  );
}

export const mainPhoto = (room: Room) =>
  room.photos.find((p) => p.isMain)?.url || room.photos[0]?.url;

export function Rating({ value }: { value: number }) {
  return (
    <span className="rating">
      <StarIcon weight="fill" aria-hidden />
      {value}
    </span>
  );
}

export function RoomCard({
  room: r,
  index = 0,
}: {
  room: Room;
  index?: number;
}) {
  return (
    <motion.div
      className="card-cell"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.45,
        delay: Math.min(index, 8) * 0.05,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      <Link
        className="room-card"
        to={`/rooms/${r.id}`}
        onMouseEnter={() => client.prefetchQuery(roomQuery(r.id))}
        onFocus={() => client.prefetchQuery(roomQuery(r.id))}
      >
        <RoomPhoto
          className="photo"
          url={mainPhoto(r)}
          title={r.title}
          seed={r.id}
          lazy
        >
          {r.avgRating == null && <span className="new-badge">Новое</span>}
        </RoomPhoto>
        <div className="card-title">
          <h3>{r.title}</h3>
          {r.avgRating != null && <Rating value={r.avgRating} />}
        </div>
        <p className="card-address">{r.address}</p>
        <p className="card-facts">
          <span>
            <RulerIcon aria-hidden />
            {r.areaM2} м²
          </span>
          <span>
            <UsersThreeIcon aria-hidden />
            до {r.capacity}
          </span>
        </p>
        <p className="card-price">
          <b>{money(r.pricePerHour)}</b> в час
        </p>
      </Link>
    </motion.div>
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
  if (page === 1 && !next) return null;
  return (
    <nav className="pagination" aria-label="Страницы">
      <button
        type="button"
        className="secondary"
        disabled={page === 1}
        onClick={() => setPage(page - 1)}
      >
        <CaretLeftIcon weight="bold" aria-hidden />
        Назад
      </button>
      <span>Страница {page}</span>
      <button
        type="button"
        className="secondary"
        disabled={!next}
        onClick={() => setPage(page + 1)}
      >
        Далее
        <CaretRightIcon weight="bold" aria-hidden />
      </button>
    </nav>
  );
}
