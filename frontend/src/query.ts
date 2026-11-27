import { QueryClient } from "@tanstack/react-query";
import { ApiError, request } from "./api";
import type { Category, Room } from "./types";
export const client = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, e) =>
        count < 1 && (!(e instanceof ApiError) || e.status >= 500),
      refetchOnWindowFocus: false,
    },
  },
});
export const categoriesQuery = {
  queryKey: ["categories"],
  queryFn: ({ signal }: { signal: AbortSignal }) =>
    request<Category[]>("/categories", { signal }),
  staleTime: 3600000,
};
export const roomQuery = (id: number) => ({
  queryKey: ["room", id],
  queryFn: ({ signal }: { signal: AbortSignal }) =>
    request<Room>(`/rooms/${id}`, { signal }),
  staleTime: 180000,
});
export async function invalidateBookings() {
  await Promise.all(
    ["bookings", "calendar", "rooms", "tenants", "penalties"].map((key) =>
      client.invalidateQueries({ queryKey: [key] }),
    ),
  );
}
