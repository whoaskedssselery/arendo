import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { categoriesQuery } from "../query";
import { request, queryString } from "../api";
import type { Room, Page } from "../types";
import { roomImages } from "../images";
import { ErrorBox, State, Field, RoomCard } from "../ui";
export default function Catalog() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("q") || "");
  const urlSearch = params.get("q") || "";
  useEffect(() => setSearch(urlSearch), [urlSearch]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (search !== (params.get("q") || "")) {
        const p = new URLSearchParams(params);
        search ? p.set("q", search) : p.delete("q");
        p.set("page", "1");
        setParams(p, { replace: true });
      }
    }, 350);
    return () => clearTimeout(t);
  }, [search, params, setParams]);
  const set = (key: string, value: string) => {
    const p = new URLSearchParams(params);
    value ? p.set(key, value) : p.delete(key);
    if (key !== "page") p.set("page", "1");
    setParams(p);
  };
  const categories = useQuery(categoriesQuery);
  const values = Object.fromEntries(params);
  const page = Math.max(1, Number(params.get("page")) || 1);
  const data = useQuery({
    queryKey: ["rooms", values],
    queryFn: ({ signal }) =>
      request<Page<Room>>(
        "/rooms?" + queryString({ ...values, page, pageSize: 6 }),
        { signal },
      ),
    staleTime: 45000,
  });
  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">ВАШИ ПЛАНЫ. НАШИ ПРОСТРАНСТВА.</p>
          <h1>
            Найдите место,
            <br />
            где всё получится.
          </h1>
          <p>
            Для работы, встреч и важных событий.
            <br />
            Выберите пространство и удобное время.
          </p>
        </div>
        <div className="hero-art">
          <img src={roomImages[0]} alt="Светлое пространство для встреч" />
          <span>Новые идеи начинаются с места</span>
        </div>
      </section>
      <section aria-labelledby="catalog-title">
        <div className="section-title">
          <div>
            <p className="eyebrow">ВЫБИРАЙТЕ ПОД СВОЙ РИТМ</p>
            <h2 id="catalog-title">Пространства</h2>
          </div>
          <span>{data.data?.total ?? "…"} вариантов</span>
        </div>
        <div className="filters">
          <Field
            label="Поиск"
            placeholder="Название или адрес"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label>
            Категория
            <select
              aria-label="Категория"
              value={params.get("categoryId") || ""}
              onChange={(e) => set("categoryId", e.target.value)}
            >
              <option value="">Все категории</option>
              {categories.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <Field
            label="Цена от, ₽/час"
            type="number"
            min="0"
            value={params.get("priceMin") || ""}
            onChange={(e) => set("priceMin", e.target.value)}
          />
          <Field
            label="Цена до, ₽/час"
            type="number"
            min="0"
            value={params.get("priceMax") || ""}
            onChange={(e) => set("priceMax", e.target.value)}
          />
          <Field
            label="Гостей от"
            type="number"
            min="1"
            value={params.get("capacity") || ""}
            onChange={(e) => set("capacity", e.target.value)}
          />
          <label>
            Сортировка
            <select
              aria-label="Сортировка"
              value={params.get("sort") || "price_asc"}
              onChange={(e) => set("sort", e.target.value)}
            >
              <option value="price_asc">Сначала дешевле</option>
              <option value="price_desc">Сначала дороже</option>
              <option value="rating_desc">По рейтингу</option>
              <option value="new">Сначала новые</option>
            </select>
          </label>
        </div>
        <AvailabilityFilter params={params} apply={(p) => setParams(p)} />
        <ErrorBox error={categories.error} />
        <State query={data}>
          {data.data?.items.length ? (
            <div className="grid">
              {data.data.items.map((room) => (
                <RoomCard key={room.id} room={room} />
              ))}
            </div>
          ) : (
            <div className="empty">
              <h3>Ничего не найдено</h3>
              <p>Попробуйте изменить фильтры.</p>
              <button
                onClick={() => {
                  setSearch("");
                  setParams({});
                }}
              >
                Сбросить фильтры
              </button>
            </div>
          )}
        </State>
        <div className="pagination">
          <button
            disabled={page === 1}
            onClick={() => set("page", String(page - 1))}
          >
            Назад
          </button>
          <span>Страница {page}</span>
          <button
            disabled={!data.data || page * 6 >= data.data.total}
            onClick={() => set("page", String(page + 1))}
          >
            Далее
          </button>
        </div>
      </section>
    </>
  );
}
function AvailabilityFilter({
  params,
  apply,
}: {
  params: URLSearchParams;
  apply: (p: URLSearchParams) => void;
}) {
  const [error, setError] = useState<unknown>();
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const from = new Date(String(d.get("from"))),
      to = new Date(String(d.get("to")));
    if (!(from < to)) {
      setError(new Error("Окончание должно быть позже начала."));
      return;
    }
    const p = new URLSearchParams(params);
    p.set("from", from.toISOString());
    p.set("to", to.toISOString());
    p.set("page", "1");
    setError(undefined);
    apply(p);
  }
  return (
    <>
      <form className="period-filter" onSubmit={submit}>
        <Field label="Свободно с" name="from" type="datetime-local" required />
        <Field label="Свободно до" name="to" type="datetime-local" required />
        <button>Проверить доступность</button>
        {params.has("from") && (
          <button
            type="button"
            className="secondary"
            onClick={() => {
              const p = new URLSearchParams(params);
              p.delete("from");
              p.delete("to");
              p.set("page", "1");
              apply(p);
            }}
          >
            Любое время
          </button>
        )}
      </form>
      <ErrorBox error={error} />
    </>
  );
}
