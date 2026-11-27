import {
  ArrowLeftIcon,
  TrashIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type ChangeEvent, type FormEvent, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { post, request } from "../api";
import DateTimeField from "../DateTimeField";
import { categoriesQuery, client, roomQuery } from "../query";
import type { Block, Room } from "../types";
import { ConfirmButton, date, ErrorBox, Field, RoomPhoto, State } from "../ui";

async function refresh() {
  await Promise.all(
    ["room", "rooms", "calendar", "blocks"].map((key) =>
      client.invalidateQueries({ queryKey: [key] }),
    ),
  );
}

export default function Manage() {
  const id = Number(useParams().id);
  const room = useQuery(roomQuery(id));
  return (
    <State query={room}>
      {room.data && (
        <>
          <Link className="back" to="/owner">
            <ArrowLeftIcon weight="bold" aria-hidden />
            Мои помещения
          </Link>
          <h1>{room.data.title}</h1>
          <Details key={room.data.id} room={room.data} />
          <Photos room={room.data} />
          <Blocks roomId={id} />
          <Deactivate room={room.data} />
        </>
      )}
    </State>
  );
}

function Details({ room }: { room: Room }) {
  const categories = useQuery(categoriesQuery);
  const save = useMutation({
    mutationFn: (body: unknown) =>
      request(`/rooms/${room.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      toast.success("Изменения сохранены.");
      await refresh();
    },
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<
      string,
      string
    >;
    save.mutate({
      title: d.title,
      address: d.address,
      description: d.description,
      categoryId: Number(d.categoryId),
      areaM2: Number(d.areaM2),
      capacity: Number(d.capacity),
      pricePerHour: Number(d.pricePerHour),
      pricePerDay: d.pricePerDay ? Number(d.pricePerDay) : null,
    });
  }
  return (
    <section className="panel">
      <h2>Описание и цены</h2>
      <form className="form-grid" onSubmit={submit}>
        <Field
          label="Название"
          name="title"
          required
          defaultValue={room.title}
        />
        <Field
          label="Адрес"
          name="address"
          required
          defaultValue={room.address}
        />
        <label className="field">
          Категория
          <select
            key={categories.data?.length}
            name="categoryId"
            defaultValue={room.categoryId}
          >
            {categories.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <Field
          label="Площадь, м²"
          name="areaM2"
          type="number"
          min="0.01"
          step="0.01"
          required
          defaultValue={room.areaM2}
        />
        <Field
          label="Вместимость"
          name="capacity"
          type="number"
          min="1"
          required
          defaultValue={room.capacity}
        />
        <Field
          label="Цена за час, ₽"
          name="pricePerHour"
          type="number"
          min="0.01"
          step="0.01"
          required
          defaultValue={room.pricePerHour}
        />
        <Field
          label="Цена за сутки, ₽"
          name="pricePerDay"
          type="number"
          min="0.01"
          step="0.01"
          defaultValue={room.pricePerDay ?? ""}
        />
        <Field
          label="Описание"
          name="description"
          defaultValue={room.description ?? ""}
        />
        <button type="submit" disabled={save.isPending}>
          Сохранить
        </button>
        <ErrorBox error={save.error} />
      </form>
    </section>
  );
}

function Photos({ room }: { room: Room }) {
  const upload = useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.append("file", file);
      return request(`/rooms/${room.id}/photos`, { method: "POST", body });
    },
    onSuccess: async () => {
      toast.success("Фото загружено.");
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (photoId: number) =>
      request(`/rooms/${room.id}/photos/${photoId}`, { method: "DELETE" }),
    onSuccess: refresh,
  });
  function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Файл больше 5 МБ.");
      return;
    }
    upload.mutate(file);
  }
  return (
    <section className="panel">
      <h2>Фото</h2>
      <div className="photo-grid">
        {room.photos.map((p) => (
          <figure key={p.id}>
            <RoomPhoto className="tile" url={p.url} title={room.title} />
            <button
              type="button"
              className="icon-button"
              aria-label="Удалить фото"
              onClick={() => remove.mutate(p.id)}
            >
              <TrashIcon size={18} aria-hidden />
            </button>
          </figure>
        ))}
        <label className="upload">
          <UploadSimpleIcon size={24} aria-hidden />
          {upload.isPending ? "Загружаем…" : "Добавить фото"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={pick}
          />
        </label>
      </div>
      <p className="muted">JPEG, PNG или WebP до 5 МБ, не больше 10 фото.</p>
      <ErrorBox error={upload.error || remove.error} />
    </section>
  );
}

function Blocks({ roomId }: { roomId: number }) {
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [invalid, setInvalid] = useState<Error>();
  const blocks = useQuery({
    queryKey: ["blocks", roomId],
    queryFn: ({ signal }) =>
      request<Block[]>(`/rooms/${roomId}/blocks`, { signal }),
  });
  const add = useMutation({
    mutationFn: (body: unknown) => post(`/rooms/${roomId}/blocks`, body),
    onSuccess: async () => {
      setStartAt("");
      setEndAt("");
      toast.success("Период закрыт.");
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (blockId: number) =>
      request(`/rooms/${roomId}/blocks/${blockId}`, { method: "DELETE" }),
    onSuccess: refresh,
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const from = new Date(startAt),
      to = new Date(endAt);
    if (!(from < to)) {
      setInvalid(new Error("Укажите начало и конец: конец позже начала."));
      return;
    }
    setInvalid(undefined);
    const reason = String(new FormData(e.currentTarget).get("reason"));
    add.mutate({
      startAt: from.toISOString(),
      endAt: to.toISOString(),
      reason,
    });
  }
  return (
    <section className="panel">
      <h2>Закрытые периоды</h2>
      <form className="form-grid" onSubmit={submit}>
        <DateTimeField
          label="Закрыто с"
          value={startAt}
          onChange={setStartAt}
        />
        <DateTimeField label="Закрыто до" value={endAt} onChange={setEndAt} />
        <Field
          label="Причина"
          name="reason"
          maxLength={255}
          placeholder="Ремонт, уборка"
        />
        <button type="submit" disabled={add.isPending}>
          Закрыть период
        </button>
      </form>
      <ErrorBox error={invalid || add.error || remove.error || blocks.error} />
      <ul className="rows">
        {blocks.data?.map((b) => (
          <li key={b.id}>
            <span>
              {date(b.startAt)} — {date(b.endAt)}
              {b.reason && <small>{b.reason}</small>}
            </span>
            <button
              type="button"
              className="secondary"
              onClick={() => remove.mutate(b.id)}
            >
              Открыть
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Deactivate({ room }: { room: Room }) {
  const nav = useNavigate();
  const remove = useMutation({
    mutationFn: () => request(`/rooms/${room.id}`, { method: "DELETE" }),
    onSuccess: async () => {
      toast.success("Помещение снято с публикации.");
      client.removeQueries({ queryKey: ["room", room.id] });
      await client.invalidateQueries({ queryKey: ["rooms"] });
      nav("/owner");
    },
  });
  return (
    <section className="panel">
      <h2>Снять с публикации</h2>
      <p className="muted">
        Помещение исчезнет из каталога, история аренд сохранится. Нельзя, пока
        есть ожидающие или активные аренды.
      </p>
      <ConfirmButton
        className="secondary"
        title="Снять с публикации?"
        text={`${room.title} исчезнет из каталога.`}
        confirmLabel="Да, снять"
        onConfirm={() => remove.mutate()}
      >
        Снять помещение
      </ConfirmButton>
      <ErrorBox error={remove.error} />
    </section>
  );
}
