import {
  BuildingsIcon,
  CameraIcon,
  DesktopTowerIcon,
  MagnifyingGlassIcon,
  PackageIcon,
  PresentationChartIcon,
  SquaresFourIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { type FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { queryString, request } from "../api";
import DateTimeField from "../DateTimeField";
import { categoriesQuery } from "../query";
import type { Category, Page, Room } from "../types";
import { ErrorBox, Field, money, Pager, RoomCard, State } from "../ui";

const pageSize = 8;

interface CategoryOption {
  id: string;
  name: string;
  price?: number;
}
const allCategories: CategoryOption = { id: "", name: "Все" };
const toOption = (c: Category): CategoryOption => ({
  id: String(c.id),
  name: c.name,
  price: c.basePricePerHour,
});
const categoryIcon = ({ id, name }: CategoryOption) => {
  if (!id) return SquaresFourIcon;
  if (/склад/i.test(name)) return PackageIcon;
  if (/ковор/i.test(name)) return DesktopTowerIcon;
  if (/перегов|конферен|зал/i.test(name)) return PresentationChartIcon;
  if (/студи|фото/i.test(name)) return CameraIcon;
  return BuildingsIcon;
};

const toInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(+d - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};

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
        `/rooms?${queryString({ ...values, page, pageSize })}`,
        { signal },
      ),
    staleTime: 45000,
  });
  const selected = params.get("categoryId") || "";
  return (
    <>
      <h1 className="catalog-title">Помещения по часам и суткам</h1>
      <SearchBar
        params={params}
        apply={setParams}
        search={search}
        setSearch={setSearch}
        set={set}
      />
      <fieldset className="categories">
        <legend className="sr-only">Категория</legend>
        {[allCategories, ...(categories.data ?? []).map(toOption)].map((c) => {
          const Icon = categoryIcon(c);
          const active = selected === c.id;
          return (
            <button
              type="button"
              key={c.id || "all"}
              className="category"
              aria-pressed={active}
              onClick={() => set("categoryId", c.id)}
            >
              <Icon
                size={26}
                weight={active ? "fill" : "regular"}
                aria-hidden
              />
              <span>{c.name}</span>
              <small>{c.price ? `от ${money(c.price)}` : "любая цена"}</small>
              {active && (
                <motion.i className="underline" layoutId="category-line" />
              )}
            </button>
          );
        })}
      </fieldset>
      <ErrorBox error={categories.error} />
      <div className="toolbar">
        <p aria-live="polite">Найдено: {data.data?.total ?? "…"}</p>
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
        <label className="field">
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
      <State query={data} skeleton="cards">
        {data.data?.items.length ? (
          <div className="grid">
            {data.data.items.map((room, index) => (
              <RoomCard key={room.id} room={room} index={index} />
            ))}
          </div>
        ) : (
          <div className="empty">
            <MagnifyingGlassIcon size={40} aria-hidden />
            <h2>Ничего не найдено</h2>
            <p>Уберите часть фильтров или выберите другое время.</p>
            <button
              type="button"
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
      <Pager
        page={page}
        setPage={(n) => set("page", String(n))}
        next={Boolean(data.data && page * pageSize < data.data.total)}
      />
    </>
  );
}

function SearchBar({
  params,
  apply,
  search,
  setSearch,
  set,
}: {
  params: URLSearchParams;
  apply: (p: URLSearchParams) => void;
  search: string;
  setSearch: (value: string) => void;
  set: (key: string, value: string) => void;
}) {
  const [error, setError] = useState<unknown>();
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const fromValue = String(d.get("from")),
      toValue = String(d.get("to"));
    const p = new URLSearchParams(params);
    search ? p.set("q", search) : p.delete("q");
    if (fromValue || toValue) {
      const from = new Date(fromValue),
        to = new Date(toValue);
      if (!(from < to)) {
        setError(new Error("Укажите начало и конец: конец позже начала."));
        return;
      }
      p.set("from", from.toISOString());
      p.set("to", to.toISOString());
    } else {
      p.delete("from");
      p.delete("to");
    }
    p.set("page", "1");
    setError(undefined);
    apply(p);
  }
  return (
    <div className="search-sticky">
      <form className="searchbar" onSubmit={submit}>
        <Field
          label="Поиск"
          placeholder="Название или адрес"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <DateTimeField
          key={`from-${params.get("from")}`}
          label="Свободно с"
          name="from"
          defaultValue={toInput(params.get("from"))}
        />
        <DateTimeField
          key={`to-${params.get("to")}`}
          label="Свободно до"
          name="to"
          align="right"
          defaultValue={toInput(params.get("to"))}
        />
        <Field
          label="Гостей от"
          type="number"
          min="1"
          placeholder="Сколько"
          value={params.get("capacity") || ""}
          onChange={(e) => set("capacity", e.target.value)}
        />
        <button type="submit" className="search-button">
          <MagnifyingGlassIcon size={20} weight="bold" aria-hidden />
          <span>Найти</span>
        </button>
      </form>
      {params.has("from") && (
        <button
          type="button"
          className="chip"
          onClick={() => {
            const p = new URLSearchParams(params);
            p.delete("from");
            p.delete("to");
            p.set("page", "1");
            apply(p);
          }}
        >
          Любое время
          <XIcon weight="bold" aria-hidden />
        </button>
      )}
      <ErrorBox error={error} />
    </div>
  );
}
