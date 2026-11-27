import { useMutation, useQuery } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { toast } from "sonner";
import { post, request } from "./api";
import { IconButton } from "./IconDialog";
import { categoriesQuery, client } from "./query";
import { ConfirmButton, ErrorBox, Field } from "./ui";

export function Categories() {
  const categories = useQuery(categoriesQuery);
  const done = async (message: string) => {
    toast.success(message);
    await client.invalidateQueries({ queryKey: ["categories"] });
  };
  const add = useMutation({
    mutationFn: (body: unknown) => post("/categories", body),
    onSuccess: () => done("Категория добавлена."),
  });
  const update = useMutation({
    mutationFn: ({ id, price }: { id: number; price: number }) =>
      request(`/categories/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ basePricePerHour: price }),
      }),
    onSuccess: () => done("Цена обновлена."),
  });
  const remove = useMutation({
    mutationFn: (id: number) =>
      request(`/categories/${id}`, { method: "DELETE" }),
    onSuccess: () => done("Категория удалена."),
  });
  function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const d = Object.fromEntries(new FormData(form));
    add.mutate(
      { name: d.name, basePricePerHour: Number(d.price) },
      { onSuccess: () => form.reset() },
    );
  }
  return (
    <section className="panel spaced">
      <h2>Категории помещений</h2>
      <ul className="rows">
        {categories.data?.map((c) => (
          <li key={c.id}>
            <span className="category-name">
              <IconButton category={c} />
              <b>{c.name}</b>
            </span>
            <form
              className="row-actions"
              onSubmit={(e) => {
                e.preventDefault();
                const price = Number(
                  new FormData(e.currentTarget).get("price"),
                );
                update.mutate({ id: c.id, price });
              }}
            >
              <input
                className="price-input"
                aria-label={`Цена от для категории ${c.name}`}
                name="price"
                type="number"
                min="0"
                step="0.01"
                defaultValue={c.basePricePerHour}
              />
              <button type="submit" className="secondary">
                Сохранить цену
              </button>
              <ConfirmButton
                className="secondary"
                title="Удалить категорию?"
                text={`${c.name}. Категорию с помещениями удалить нельзя.`}
                confirmLabel="Да, удалить"
                onConfirm={() => remove.mutate(c.id)}
              >
                Удалить
              </ConfirmButton>
            </form>
          </li>
        ))}
      </ul>
      <form className="form-grid" onSubmit={create}>
        <Field label="Новая категория" name="name" required maxLength={100} />
        <Field
          label="Цена от, ₽/час"
          name="price"
          type="number"
          min="0"
          step="0.01"
          required
        />
        <button type="submit" disabled={add.isPending}>
          Добавить категорию
        </button>
      </form>
      <ErrorBox error={add.error || update.error || remove.error} />
    </section>
  );
}
