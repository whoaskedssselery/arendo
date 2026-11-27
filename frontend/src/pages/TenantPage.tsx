import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { request } from "../api";
import type { Tenant } from "../types";
import { money, State } from "../ui";
export default function TenantPage() {
  const id = useParams().id;
  const data = useQuery({
    queryKey: ["tenants", id],
    queryFn: ({ signal }) => request<Tenant>(`/tenants/${id}`, { signal }),
  });
  return (
    <State query={data}>
      {data.data && (
        <div className="panel">
          <p className="eyebrow">КАРТОЧКА АРЕНДАТОРА</p>
          <h1>{data.data.fullName}</h1>
          <div className="stats">
            {[
              ["Всего аренд", data.data.bookingsTotal],
              ["Завершено", data.data.completedCount],
              ["Отменено", data.data.cancelledCount],
              ["Просрочек", data.data.lateReturns],
              ["Неоплаченные штрафы", money(data.data.unpaidPenalties)],
              ["Рейтинг", data.data.avgRating ?? "Нет оценок"],
            ].map(([k, v]) => (
              <div key={k}>
                <span>{k}</span>
                <b>{v}</b>
              </div>
            ))}
          </div>
          <p>
            {data.data.isBlacklisted ? "В чёрном списке" : "Ограничений нет"}
          </p>
        </div>
      )}
    </State>
  );
}
