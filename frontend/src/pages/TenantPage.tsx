import { ProhibitIcon, ShieldCheckIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { request } from "../api";
import type { Tenant } from "../types";
import { initials, money, State } from "../ui";

export default function TenantPage() {
  const id = useParams().id;
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
        </>
      )}
    </State>
  );
}
