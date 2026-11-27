export type Role = "tenant" | "owner" | "admin";
export interface User {
  id: number;
  email: string;
  fullName: string;
  phone?: string;
  role: Role;
  status: "active" | "banned";
}
export interface Session {
  accessToken: string;
  refreshToken: string;
  user: User;
}
export interface Category {
  id: number;
  name: string;
  basePricePerHour: number;
}
export interface Room {
  id: number;
  ownerId: number;
  categoryId: number;
  title: string;
  description?: string;
  address: string;
  areaM2: number;
  capacity: number;
  pricePerHour: number;
  pricePerDay: number | null;
  isActive: boolean;
  avgRating: number | null;
  reviewsCount: number;
  photos: { id: number; url: string; isMain: boolean; sortOrder: number }[];
}
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
export interface Slot {
  kind: "booking" | "block";
  startAt: string;
  endAt: string;
  status: string;
}
export interface Booking {
  id: number;
  roomId: number;
  tenantId: number;
  startAt: string;
  endAt: string;
  status: "pending" | "active" | "completed" | "cancelled";
  totalPrice: number;
  isOverdue: boolean;
  history: { oldStatus: string | null; newStatus: string; changedAt: string }[];
}
export interface Tenant {
  tenantId: number;
  fullName: string;
  bookingsTotal: number;
  completedCount: number;
  cancelledCount: number;
  lateReturns: number;
  unpaidPenalties: number;
  avgRating: number | null;
  isBlacklisted: boolean;
}
