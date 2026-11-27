import type { Session } from "./types";
export const demo = import.meta.env.VITE_DEMO_MODE === "true";
const base = import.meta.env.VITE_API_URL || "/api/v1";
let session: Session | null = null;
try {
  session = JSON.parse(sessionStorage.getItem("arendo.session") || "null");
} catch {
  /* invalid saved state */
}
export const getSession = () => session;
export function setSession(value: Session | null) {
  session = value;
  if (value) sessionStorage.setItem("arendo.session", JSON.stringify(value));
  else sessionStorage.removeItem("arendo.session");
  window.dispatchEvent(new Event("session"));
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
let refreshing: Promise<void> | undefined;
const messages: Record<number, string> = {
  401: "Сессия истекла. Войдите снова.",
  403: "Недостаточно прав для этого действия.",
  404: "Данные не найдены. Проверьте ссылку или вернитесь в каталог.",
  409: "Конфликт данных: период занят или действие больше недоступно.",
  422: "Проверьте введённые данные.",
  429: "Слишком много попыток. Повторите позже.",
};
export async function request<T>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  if (demo) {
    const { mockRequest } = await import("./mock");
    return mockRequest(path, options, session) as Promise<T>;
  }
  let response: Response;
  try {
    response = await fetch(base + path, {
      ...options,
      headers: {
        ...(typeof options.body === "string"
          ? { "Content-Type": "application/json" }
          : {}),
        ...(session ? { Authorization: `Bearer ${session.accessToken}` } : {}),
        ...options.headers,
      },
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError(
      0,
      "Нет связи с сервером. Проверьте подключение и повторите попытку.",
    );
  }
  if (
    response.status === 401 &&
    session &&
    retry &&
    !path.startsWith("/auth/")
  ) {
    refreshing ??= request<Session>(
      "/auth/refresh",
      {
        method: "POST",
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      },
      false,
    )
      .then(setSession)
      .catch((e) => {
        setSession(null);
        throw e;
      })
      .finally(() => {
        refreshing = undefined;
      });
    await refreshing;
    return request(path, options, false);
  }
  if (!response.ok) {
    // Тексты бизнес-правил сервер присылает по-русски; технические заменяем своими.
    const body = await response.json().catch(() => null);
    const own =
      typeof body?.message === "string" && /[а-яё]/i.test(body.message)
        ? body.message
        : undefined;
    throw new ApiError(
      response.status,
      own ||
        (response.status === 401 && path === "/auth/login"
          ? "Неверный email или пароль."
          : messages[response.status]) ||
        "Не удалось выполнить запрос. Попробуйте ещё раз.",
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export const post = <T>(path: string, body: unknown = {}) =>
  request<T>(path, { method: "POST", body: JSON.stringify(body) });
export function queryString(values: Record<string, unknown>) {
  const q = new URLSearchParams();
  Object.entries(values).forEach(([k, v]) => {
    if (v !== "" && v !== undefined && v !== null) q.set(k, String(v));
  });
  return q.toString();
}
