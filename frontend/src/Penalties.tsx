import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { request } from "./api";
import { client } from "./query";
import type { Penalty } from "./types";
import { date, ErrorBox, money } from "./ui";

const statusNames = {
  unpaid: "Не оплачен",
  paid: "Оплачен",
  waived: "Списан",
};

export function Penalties({
  tenantId,
  manage = false,
}: {
  tenantId?: number;
  manage?: boolean;
}) {
  const penalties = useQuery({
    queryKey: ["penalties", tenantId ?? "all"],
    queryFn: ({ signal }) =>
      request<Penalty[]>(
        tenantId ? `/penalties?tenantId=${tenantId}` : "/penalties",
        { signal },
      ),
  });
  const settle = useMutation({
    mutationFn: ({ id, status }: { id: number; status: "paid" | "waived" }) =>
      request(`/penalties/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: async () => {
      toast.success("Штраф обновлён.");
      await Promise.all(
        ["penalties", "tenants"].map((key) =>
          client.invalidateQueries({ queryKey: [key] }),
        ),
      );
    },
  });
  if (!manage && !penalties.data?.length && !penalties.error) return null;
  return (
    <section className="panel spaced">
      <h2>Штрафы</h2>
      <ErrorBox error={penalties.error || settle.error} />
      {penalties.data?.length === 0 && <p className="muted">Штрафов нет.</p>}
      <ul className="rows">
        {penalties.data?.map((p) => (
          <li key={p.id}>
            <span>
              <b>{money(p.amount)}</b>
              <small>
                {p.roomTitle}
                {manage && ` · ${p.tenantName}`} · {date(p.createdAt)}
                {p.note && ` · ${p.note}`}
              </small>
            </span>
            <span className="row-actions">
              <span
                className={`badge ${p.status === "unpaid" ? "overdue" : "completed"}`}
              >
                {statusNames[p.status]}
              </span>
              {manage && p.status === "unpaid" && (
                <>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => settle.mutate({ id: p.id, status: "paid" })}
                  >
                    Оплачен
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      settle.mutate({ id: p.id, status: "waived" })
                    }
                  >
                    Списать
                  </button>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
