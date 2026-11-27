// Explicit demo adapter. Never used as a fallback for a failed API request.

import { ApiError } from "./api";
import { photoFor } from "./images";
import type { Booking, Category, Room, Session, User } from "./types";
export const categories: Category[] = [
  { id: 1, name: "Лофты", basePricePerHour: 1800 },
  { id: 2, name: "Переговорные", basePricePerHour: 900 },
  { id: 3, name: "Фотостудии", basePricePerHour: 1400 },
];
const names = [
  "Лофт «Свет»",
  "Переговорная «Фокус»",
  "Студия «Форма»",
  "Лофт «Ателье»",
  "Зал «Контекст»",
  "Студия «Воздух»",
  "Лофт «Ритм»",
  "Переговорная «Диалог»",
  "Студия «Линия»",
];
const rooms: Room[] = names.map((title, i) => ({
  id: i + 1,
  ownerId: 2,
  categoryId: (i % 3) + 1,
  title,
  description:
    "Светлое пространство для ваших идей. Большие окна, удобная мебель, быстрый Wi-Fi и всё необходимое для комфортной работы.",
  address: `Москва, ул. Просторная, ${i + 10}`,
  areaM2: 40 + i * 12,
  capacity: 6 + i * 3,
  pricePerHour: 900 + i * 300,
  pricePerDay: 7000 + i * 2000,
  isActive: true,
  avgRating: 4.7,
  reviewsCount: 12 + i,
  photos: [
    {
      id: i + 1,
      url: photoFor(title, Math.floor(i / 3)),
      isMain: true,
      sortOrder: 0,
    },
  ],
}));
const users: User[] = [
  {
    id: 1,
    email: "tenant@arendo.test",
    fullName: "Анна Соколова",
    role: "tenant",
    status: "active",
  },
  {
    id: 2,
    email: "owner@arendo.test",
    fullName: "Михаил Орлов",
    role: "owner",
    status: "active",
  },
  {
    id: 3,
    email: "admin@arendo.test",
    fullName: "Администратор",
    role: "admin",
    status: "active",
  },
];
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
tomorrow.setHours(12, 0, 0, 0);
const bookings: Booking[] = [
  {
    id: 1,
    roomId: 1,
    tenantId: 1,
    startAt: new Date(Date.now() - 7200000).toISOString(),
    endAt: new Date(Date.now() + 3600000).toISOString(),
    status: "active",
    totalPrice: 2700,
    isOverdue: false,
    history: [],
  },
  {
    id: 2,
    roomId: 2,
    tenantId: 1,
    startAt: tomorrow.toISOString(),
    endAt: new Date(+tomorrow + 7200000).toISOString(),
    status: "pending",
    totalPrice: 2400,
    isOverdue: false,
    history: [],
  },
];
const passwords = new Map(users.map((u) => [u.email, "Arendo123!"]));
let nextId = 100;
export async function mockRequest(
  path: string,
  options: RequestInit,
  session: Session | null,
): Promise<unknown> {
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, 80);
    if (options.signal?.aborted) {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    } else
      options.signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(t);
          reject(new DOMException("Aborted", "AbortError"));
        },
        { once: true },
      );
  });
  const url = new URL(path, "http://demo");
  const p = url.pathname;
  const q = url.searchParams;
  const method = options.method || "GET";
  const data = options.body ? JSON.parse(String(options.body)) : {};
  const fail: (status: number, message: string) => never = (
    status,
    message,
  ) => {
    throw new ApiError(status, message);
  };
  if (p === "/categories" && method === "GET") return categories;
  if (p === "/rooms" && method === "GET") {
    let list = rooms.filter(
      (r) =>
        (!q.get("q") ||
          `${r.title} ${r.address}`
            .toLowerCase()
            .includes(String(q.get("q")).toLowerCase())) &&
        (!q.get("categoryId") ||
          r.categoryId === +String(q.get("categoryId"))) &&
        (!q.get("priceMin") || r.pricePerHour >= +String(q.get("priceMin"))) &&
        (!q.get("priceMax") || r.pricePerHour <= +String(q.get("priceMax"))) &&
        (!q.get("capacity") || r.capacity >= +String(q.get("capacity"))) &&
        (!q.get("from") ||
          !bookings.some(
            (b) =>
              b.roomId === r.id &&
              ["pending", "active"].includes(b.status) &&
              b.startAt < String(q.get("to")) &&
              b.endAt > String(q.get("from")),
          )),
    );
    list = list.sort((a, b) =>
      q.get("sort") === "price_desc"
        ? b.pricePerHour - a.pricePerHour
        : q.get("sort") === "new"
          ? b.id - a.id
          : q.get("sort") === "rating_desc"
            ? (b.avgRating || 0) - (a.avgRating || 0)
            : a.pricePerHour - b.pricePerHour,
    );
    const page = +(q.get("page") || 1),
      pageSize = +(q.get("pageSize") || 6);
    return {
      items: list.slice((page - 1) * pageSize, page * pageSize),
      total: list.length,
      page,
      pageSize,
    };
  }
  if (/^\/rooms\/\d+$/.test(p) && method === "GET")
    return (
      rooms.find((r) => r.id === +p.split("/")[2]) ||
      fail(404, "Помещение не найдено.")
    );
  if (p.endsWith("/calendar"))
    return bookings
      .filter(
        (b) =>
          b.roomId === +p.split("/")[2] &&
          ["pending", "active"].includes(b.status) &&
          b.startAt < String(q.get("to")) &&
          b.endAt > String(q.get("from")),
      )
      .map((b) => ({ kind: "booking", ...b }));
  if (
    method === "GET" &&
    (/\/(reviews|blocks)$/.test(p) || p === "/penalties" || p === "/blacklist")
  )
    return [];
  if (p === "/auth/login" || p === "/auth/register") {
    let user = users.find((u) => u.email === data.email);
    if (p.endsWith("register")) {
      if (user) fail(409, "Этот email уже зарегистрирован.");
      user = {
        id: ++nextId,
        email: data.email,
        fullName: data.fullName,
        phone: data.phone,
        role: data.role,
        status: "active",
      };
      passwords.set(data.email, data.password);
      users.push(user);
    } else if (!user || data.password !== passwords.get(data.email))
      fail(401, "Неверный email или пароль.");
    if (user?.status === "banned") fail(403, "Аккаунт заблокирован.");
    return { user, accessToken: "demo", refreshToken: "demo" };
  }
  if (!session) fail(401, "Войдите в аккаунт.");
  const user = session.user;
  if (p === "/rooms/owned") {
    if (user.role !== "owner") fail(403, "Недостаточно прав.");
    const start = (+(q.get("page") || 1) - 1) * +(q.get("pageSize") || 20);
    return rooms
      .filter((r) => r.ownerId === user.id)
      .slice(start, start + +(q.get("pageSize") || 20));
  }
  if (p === "/auth/me") return user;
  if (p === "/auth/logout") return undefined;
  if (p === "/bookings" && method === "GET")
    return bookings
      .filter(
        (b) =>
          (user.role !== "tenant" || b.tenantId === user.id) &&
          (!q.get("status") || q.get("status") === b.status),
      )
      .slice(
        (+(q.get("page") || 1) - 1) * +(q.get("pageSize") || 20),
        +(q.get("page") || 1) * +(q.get("pageSize") || 20),
      );
  if (p === "/bookings" && method === "POST") {
    if (user.role !== "tenant") fail(403, "Арендовать может только арендатор.");
    const room = rooms.find((r) => r.id === data.roomId);
    if (!room) fail(404, "Помещение не найдено.");
    if (
      new Date(data.startAt) <= new Date() ||
      data.startAt >= data.endAt ||
      +new Date(data.endAt) - +new Date(data.startAt) > 30 * 86400000
    )
      fail(422, "Некорректный период.");
    if (
      bookings.some(
        (b) =>
          b.roomId === data.roomId &&
          ["pending", "active"].includes(b.status) &&
          b.startAt < data.endAt &&
          b.endAt > data.startAt,
      )
    )
      fail(409, "Выбранный период уже занят.");
    const hours = Math.ceil(
      (+new Date(data.endAt) - +new Date(data.startAt)) / 3600000,
    );
    const b: Booking = {
      ...data,
      id: ++nextId,
      tenantId: user.id,
      status: "pending",
      totalPrice: Math.min(
        hours * room.pricePerHour,
        Math.ceil(hours / 24) * (room.pricePerDay || Infinity),
      ),
      isOverdue: false,
      history: [],
    };
    bookings.push(b);
    return b;
  }
  if (/^\/bookings\/\d+\/(cancel|complete)$/.test(p)) {
    const b = bookings.find((b) => b.id === +p.split("/")[2]);
    if (!b) fail(404, "Аренда не найдена.");
    if (p.endsWith("cancel")) {
      if (
        !["pending", "active"].includes(b.status) ||
        (user.role === "tenant" &&
          (b.tenantId !== user.id || b.status !== "pending")) ||
        (user.role === "owner" && b.status !== "active")
      )
        fail(409, "Отмена недоступна.");
      b.status = "cancelled";
    } else {
      if (user.role === "tenant") fail(403, "Недостаточно прав.");
      if (b.status !== "active")
        fail(409, "Завершить можно только активную аренду.");
      b.status = "completed";
    }
    return b;
  }
  if (p === "/rooms" && method === "POST") {
    if (user.role !== "owner") fail(403, "Недостаточно прав.");
    const r = {
      ...data,
      id: ++nextId,
      ownerId: user.id,
      photos: [],
      isActive: true,
      avgRating: null,
      reviewsCount: 0,
    };
    rooms.push(r);
    return r;
  }
  if (p === "/tenants" || p.startsWith("/tenants/")) {
    if (user.role === "tenant") fail(403, "Недостаточно прав.");
    const cards = users
      .filter((u) => u.role === "tenant")
      .map((u) => ({
        tenantId: u.id,
        fullName: u.fullName,
        bookingsTotal: bookings.filter((b) => b.tenantId === u.id).length,
        completedCount: bookings.filter(
          (b) => b.tenantId === u.id && b.status === "completed",
        ).length,
        cancelledCount: 0,
        lateReturns: 0,
        unpaidPenalties: 0,
        avgRating: null,
        isBlacklisted: false,
      }));
    return p === "/tenants"
      ? cards
      : cards.find((t) => t.tenantId === +p.split("/")[2]) ||
          fail(404, "Арендатор не найден.");
  }
  if (p === "/admin/users") {
    if (user.role !== "admin") fail(403, "Недостаточно прав.");
    return users.slice(
      (+(q.get("page") || 1) - 1) * +(q.get("pageSize") || 20),
      +(q.get("page") || 1) * +(q.get("pageSize") || 20),
    );
  }
  if (p.startsWith("/admin/users/") && method === "PATCH") {
    if (user.role !== "admin") fail(403, "Недостаточно прав.");
    const u = users.find((u) => u.id === +p.split("/")[3]);
    if (!u) fail(404, "Пользователь не найден.");
    u.status = data.status;
    return u;
  }
  return fail(404, "Этот маршрут не поддерживается в деморежиме.");
}
