import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { queryString, request } from "../api";
import { client } from "../query";
import type { User } from "../types";
import {
  ConfirmButton,
  ErrorBox,
  initials,
  Pager,
  roleLabels,
  State,
  useRequiredSession,
} from "../ui";

export default function Admin() {
  const s = useRequiredSession();
  const [page, setPage] = useState(1);
  const data = useQuery({
    queryKey: ["users", page],
    queryFn: ({ signal }) =>
      request<User[]>(`/admin/users?${queryString({ page, pageSize: 10 })}`, {
        signal,
      }),
  });
  const mutation = useMutation({
    mutationFn: (u: User) =>
      request(`/admin/users/${u.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status: u.status === "active" ? "banned" : "active",
        }),
      }),
    onSuccess: () => {
      toast.success("Доступ изменён.");
      return client.invalidateQueries({ queryKey: ["users"] });
    },
  });
  return (
    <>
      <h1>Администрирование</h1>
      <p>Пользователи и доступ к сервису.</p>
      <ErrorBox error={mutation.error} />
      <State query={data} skeleton="rows">
        <div className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>Пользователь</th>
                <th>Роль</th>
                <th>Статус</th>
                <th>Действие</th>
              </tr>
            </thead>
            <tbody>
              {data.data?.map((u) => {
                const active = u.status === "active";
                const action = active ? "Заблокировать" : "Разблокировать";
                return (
                  <tr key={u.id}>
                    <td>
                      <div className="person">
                        <span className="avatar" aria-hidden>
                          {initials(u.fullName)}
                        </span>
                        <span>
                          {u.fullName}
                          <small>{u.email}</small>
                        </span>
                      </div>
                    </td>
                    <td>{roleLabels[u.role]}</td>
                    <td>
                      <span
                        className={active ? "badge completed" : "badge overdue"}
                      >
                        {active ? "Активен" : "Заблокирован"}
                      </span>
                    </td>
                    <td>
                      <ConfirmButton
                        className="secondary"
                        disabled={mutation.isPending || u.id === s.user.id}
                        title={`${action}?`}
                        text={`${u.fullName}, ${u.email}`}
                        confirmLabel={`Да, ${action.toLowerCase()}`}
                        onConfirm={() => mutation.mutate(u)}
                      >
                        {action}
                      </ConfirmButton>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </State>
      <Pager
        page={page}
        setPage={setPage}
        next={(data.data?.length ?? 0) === 10}
      />
    </>
  );
}
