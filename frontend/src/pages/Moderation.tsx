import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { request } from "../api";
import { Penalties } from "../Penalties";
import { client } from "../query";
import type { BlacklistEntry, Tenant } from "../types";
import { date, ErrorBox, money, State, useRequiredSession } from "../ui";

export default function Moderation() {
  const s = useRequiredSession();
  const tenants = useQuery({
    queryKey: ["tenants", "list"],
    queryFn: ({ signal }) => request<Tenant[]>("/tenants", { signal }),
  });
  const entries = useQuery({
    queryKey: ["blacklist"],
    queryFn: ({ signal }) =>
      request<BlacklistEntry[]>("/blacklist", { signal }),
  });
  const revoke = useMutation({
    mutationFn: (id: number) =>
      request(`/blacklist/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      toast.success("Ограничение снято.");
      await Promise.all(
        ["blacklist", "tenants", "users"].map((key) =>
          client.invalidateQueries({ queryKey: [key] }),
        ),
      );
    },
  });
  return (
    <>
      <h1>Арендаторы</h1>
      <p className="muted">
        {s.user.role === "admin"
          ? "Все арендаторы, штрафы и ограничения сервиса."
          : "Те, кто арендовал ваши помещения."}
      </p>
      <State query={tenants} skeleton="rows">
        <div className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>Арендатор</th>
                <th>Рейтинг</th>
                <th>Аренд</th>
                <th>Просрочек</th>
                <th>Долг</th>
              </tr>
            </thead>
            <tbody>
              {tenants.data?.map((t) => (
                <tr key={t.tenantId}>
                  <td>
                    <Link className="text-link" to={`/tenants/${t.tenantId}`}>
                      {t.fullName}
                    </Link>
                    {t.isBlacklisted && (
                      <span className="badge overdue">В чёрном списке</span>
                    )}
                  </td>
                  <td>{t.avgRating ?? "—"}</td>
                  <td>{t.bookingsTotal}</td>
                  <td>{t.lateReturns}</td>
                  <td>{money(t.unpaidPenalties)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {tenants.data?.length === 0 && (
            <p className="muted">Пока никто не арендовал.</p>
          )}
        </div>
      </State>
      <section className="panel">
        <h2>Чёрный список и предупреждения</h2>
        <ErrorBox error={entries.error || revoke.error} />
        {entries.data?.length === 0 && (
          <p className="muted">
            Записей нет. Добавить можно из карточки арендатора.
          </p>
        )}
        <ul className="rows">
          {entries.data?.map((e) => (
            <li key={e.id}>
              <span>
                <b>{e.tenantName}</b>
                <small>
                  {e.entryType === "ban" ? "Бан" : "Предупреждение"} ·{" "}
                  {e.reason}
                  {e.ownerId === null && " · весь сервис"}
                  {e.expiresAt && ` · до ${date(e.expiresAt)}`}
                </small>
              </span>
              {(s.user.role === "admin" || e.ownerId === s.user.id) && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => revoke.mutate(e.id)}
                >
                  Снять
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
      <Penalties manage />
    </>
  );
}
