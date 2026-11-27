import { PlusIcon } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { post, queryString, request } from "../api";
import { categoriesQuery, client } from "../query";
import type { Room } from "../types";
import { ErrorBox, Field, Pager, RoomCard, State } from "../ui";

export default function Owner() {
  // Номер страницы в адресе, чтобы он сохранялся при возврате из карточки.
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const setPage = (n: number) => setParams(n > 1 ? { page: String(n) } : {});
  const rooms = useQuery({
    queryKey: ["rooms", "owner", page],
    queryFn: ({ signal }) =>
      request<Room[]>(`/rooms/owned?${queryString({ page, pageSize: 8 })}`, {
        signal,
      }),
    staleTime: 45000,
  });
  const categories = useQuery(categoriesQuery);
  const mutation = useMutation({
    mutationFn: (data: unknown) => post("/rooms", data),
    onSuccess: () => {
      toast.success("Помещение добавлено.");
      return client.invalidateQueries({ queryKey: ["rooms"] });
    },
  });
  function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget;
    const d: Record<string, string | number> = Object.fromEntries(
      new FormData(f),
    ) as Record<string, string>;
    for (const k of ["categoryId", "areaM2", "capacity", "pricePerHour"])
      d[k] = Number(d[k]);
    if (d.pricePerDay) d.pricePerDay = Number(d.pricePerDay);
    else delete d.pricePerDay;
    mutation.mutate(d, { onSuccess: () => f.reset() });
  }
  return (
    <>
      <div className="page-head">
        <h1>Кабинет владельца</h1>
        <Link className="button" to="/bookings">
          Аренды и приёмка
        </Link>
      </div>
      <details className="panel add-room">
        <summary>
          <PlusIcon weight="bold" aria-hidden />
          Добавить помещение
        </summary>
        <form onSubmit={create} className="form-grid">
          <Field label="Название" name="title" required maxLength={150} />
          <Field label="Адрес" name="address" required maxLength={255} />
          <label className="field">
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
            label="Цена за час, ₽"
            name="pricePerHour"
            type="number"
            min="0.01"
            step="0.01"
            required
          />
          <Field
            label="Цена за сутки, ₽ (необязательно)"
            name="pricePerDay"
            type="number"
            min="0.01"
            step="0.01"
          />
          <Field label="Описание" name="description" />
          <button
            type="submit"
            disabled={mutation.isPending || !categories.data?.length}
          >
            Добавить
          </button>
          <ErrorBox error={mutation.error} />
        </form>
      </details>
      <State query={rooms} skeleton="cards">
        <div className="grid">
          {rooms.data?.map((r, index) => (
            <div key={r.id} className="owned">
              <RoomCard room={r} index={index} />
              <Link className="button manage" to={`/owner/rooms/${r.id}`}>
                Управлять
              </Link>
            </div>
          ))}
        </div>
        {!rooms.data?.length && (
          <p className="empty">У вас пока нет помещений.</p>
        )}
      </State>
      <Pager
        page={page}
        setPage={setPage}
        next={(rooms.data?.length ?? 0) === 8}
      />
    </>
  );
}
