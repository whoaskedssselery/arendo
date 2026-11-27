import {
  EnvelopeIcon,
  PhoneIcon,
  ProhibitIcon,
  ShieldCheckIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { post, request } from "../api";
import { Penalties } from "../Penalties";
import { client } from "../query";
import type { Tenant } from "../types";
import {
  date,
  ErrorBox,
  Field,
  initials,
  money,
  State,
  StatusBadge,
} from "../ui";

export default function TenantPage() {
  const id = Number(useParams().id);
  const data = useQuery({
    queryKey: ["tenants", id],
    queryFn: ({ signal }) => request<Tenant>(`/tenants/${id}`, { signal }),
  });
  const t = data.data;
  return (
    <State query={data}>
      {t && (
        <>
          <div className="tenant-head">
            <span className="avatar large" aria-hidden>
              {initials(t.fullName)}
            </span>
            <div>
              <h1>{t.fullName}</h1>
              <span
                className={
                  t.isBlacklisted ? "badge overdue" : "badge completed"
                }
              >
                {t.isBlacklisted ? (
                  <ProhibitIcon weight="fill" aria-hidden />
                ) : (
                  <ShieldCheckIcon weight="fill" aria-hidden />
                )}
                {t.isBlacklisted ? "В чёрном списке" : "Ограничений нет"}
              </span>
              <p className="contacts">
                {t.email && (
                  <a className="text-link" href={`mailto:${t.email}`}>
                    <EnvelopeIcon aria-hidden /> {t.email}
                  </a>
                )}
                {t.phone && (
                  <a className="text-link" href={`tel:${t.phone}`}>
                    <PhoneIcon aria-hidden /> {t.phone}
                  </a>
                )}
              </p>
            </div>
          </div>
          <dl className="stats">
            {[
              ["Рейтинг", t.avgRating ?? "Нет оценок"],
              ["Всего аренд", t.bookingsTotal],
              ["Завершено", t.completedCount],
              ["Отменено", t.cancelledCount],
              ["Просрочек", t.lateReturns],
              ["Неоплаченные штрафы", money(t.unpaidPenalties)],
            ].map(([name, value]) => (
              <div key={name}>
                <dt>{name}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {Boolean(t.history?.length) && (
            <section className="panel spaced">
              <h2>История аренд</h2>
              <ul className="rows">
                {t.history?.map((h) => (
                  <li key={h.id}>
                    <span>
                      <b>{h.roomTitle}</b>
                      <small>
                        {date(h.startAt)} — {date(h.endAt)}
                      </small>
                    </span>
                    <StatusBadge status={h.status} />
                  </li>
                ))}
              </ul>
            </section>
          )}
          <Penalties tenantId={id} manage />
          <Restrict tenantId={id} />
        </>
      )}
    </State>
  );
}

function Restrict({ tenantId }: { tenantId: number }) {
  const add = useMutation({
    mutationFn: (body: unknown) => post("/blacklist", body),
    onSuccess: async () => {
      toast.success("Запись добавлена.");
      await Promise.all(
        ["blacklist", "tenants"].map((key) =>
          client.invalidateQueries({ queryKey: [key] }),
        ),
      );
    },
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const d = Object.fromEntries(new FormData(form));
    add.mutate(
      { tenantId, entryType: d.entryType, reason: d.reason },
      { onSuccess: () => form.reset() },
    );
  }
  return (
    <section className="panel">
      <h2>Чёрный список</h2>
      <form className="form-grid" onSubmit={submit}>
        <label className="field">
          Что сделать
          <select name="entryType">
            <option value="warning">Предупреждение</option>
            <option value="ban">Запретить аренду</option>
          </select>
        </label>
        <Field label="Причина" name="reason" required maxLength={500} />
        <button type="submit" disabled={add.isPending}>
          Добавить
        </button>
        <ErrorBox error={add.error} />
      </form>
    </section>
  );
}
