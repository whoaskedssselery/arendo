import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { client } from "../query";
import { request, queryString } from "../api";
import type { User } from "../types";
import { useSession, ErrorBox, State, Pager } from "../ui";
export default function Admin() {
  const s = useSession()!;
  const [page, setPage] = useState(1);
  const data = useQuery({
    queryKey: ["users", page],
    queryFn: ({ signal }) =>
      request<User[]>("/admin/users?" + queryString({ page, pageSize: 10 }), {
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
    onSuccess: () => client.invalidateQueries({ queryKey: ["users"] }),
  });
  return (
    <>
      <h1>Администрирование</h1>
      <p>Пользователи и доступ к сервису</p>
      <ErrorBox error={mutation.error} />
      <State query={data}>
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
              {data.data?.map((u) => (
                <tr key={u.id}>
                  <td>
                    {u.fullName}
                    <small>{u.email}</small>
                  </td>
                  <td>{u.role}</td>
                  <td>{u.status === "active" ? "Активен" : "Заблокирован"}</td>
                  <td>
                    <button
                      disabled={mutation.isPending || u.id === s.user.id}
                      onClick={() => {
                        if (confirm("Изменить доступ пользователя?"))
                          mutation.mutate(u);
                      }}
                    >
                      {u.status === "active"
                        ? "Заблокировать"
                        : "Разблокировать"}
                    </button>
                  </td>
                </tr>
              ))}
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
