import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { client, categoriesQuery } from "../query";
import { request, post, queryString } from "../api";
import type { Room } from "../types";
import { ErrorBox, State, Field, RoomCard, Pager } from "../ui";
export default function Owner() {
  const [page, setPage] = useState(1);
  const rooms = useQuery({
    queryKey: ["rooms", "owner", page],
    queryFn: ({ signal }) =>
      request<Room[]>("/rooms/owned?" + queryString({ page, pageSize: 6 }), {
        signal,
      }),
    staleTime: 45000,
  });
  const categories = useQuery(categoriesQuery);
  const mutation = useMutation({
    mutationFn: (data: unknown) => post("/rooms", data),
    onSuccess: () => client.invalidateQueries({ queryKey: ["rooms"] }),
  });
  function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget;
    const d: Record<string, string | number> = Object.fromEntries(
      new FormData(f),
    ) as Record<string, string>;
    for (const k of ["categoryId", "areaM2", "capacity", "pricePerHour"])
      d[k] = Number(d[k]);
    mutation.mutate(d, { onSuccess: () => f.reset() });
  }
  return (
    <>
      <p className="eyebrow">ПРОСТРАНСТВА ПОД ВАШИМ УПРАВЛЕНИЕМ</p>
      <div className="section-title">
        <h1>Кабинет владельца</h1>
        <Link className="button" to="/bookings">
          Аренды и приёмка
        </Link>
      </div>
      <State query={rooms}>
        <div className="grid">
          {rooms.data?.map((r) => (
            <RoomCard key={r.id} room={r} />
          ))}
        </div>
        {!rooms.data?.length && (
          <p className="empty">У вас пока нет помещений.</p>
        )}
      </State>
      <Pager
        page={page}
        setPage={setPage}
        next={(rooms.data?.length ?? 0) === 6}
      />
      <details className="panel">
        <summary>Добавить помещение</summary>
        <form onSubmit={create} className="form-grid">
          <Field label="Название" name="title" required maxLength={150} />
          <Field label="Адрес" name="address" required maxLength={255} />
          <label>
            Категория
            <select aria-label="Категория" name="categoryId" required>
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
          />
          <Field
            label="Вместимость"
            name="capacity"
            type="number"
            min="1"
            required
          />
          <Field
            label="Цена за час"
            name="pricePerHour"
            type="number"
            min="0.01"
            step="0.01"
            required
          />
          <Field label="Описание" name="description" />
          <button disabled={mutation.isPending || !categories.data?.length}>
            Добавить
          </button>
          <ErrorBox error={mutation.error} />
          {mutation.isSuccess && <p role="status">Помещение добавлено.</p>}
        </form>
      </details>
    </>
  );
}
