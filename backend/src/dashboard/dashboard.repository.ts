import { Injectable } from "@nestjs/common";
import type { UserRow } from "../auth/auth.types";
import { DatabaseService } from "../database/database.service";
import type { PaginationDto } from "./dashboard.dto";

@Injectable()
export class DashboardRepository {
  constructor(private readonly db: DatabaseService) {}
  async users(query: PaginationDto) {
    const { rows } = await this.db.pool.query<UserRow>(
      `SELECT id, email, full_name, phone, role, status, created_at FROM users
       ORDER BY id LIMIT $1 OFFSET $2`,
      [query.pageSize ?? 20, ((query.page ?? 1) - 1) * (query.pageSize ?? 20)],
    );
    return rows;
  }
  async status(id: number, status: string) {
    return this.db.transaction(async (tx) => {
      const { rows } = await tx.query<UserRow>(
        `UPDATE users SET status = $2 WHERE id = $1
        RETURNING id, email, full_name, phone, role, status, created_at`,
        [id, status],
      );
      if (status === "banned")
        await tx.query(
          "UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL",
          [id],
        );
      return rows[0];
    });
  }
  async tenant(id: number, actor: UserRow) {
    const { rows } = await this.db.pool.query(
      `SELECT u.id AS "tenantId", u.full_name AS "fullName",
       (SELECT count(*)::int FROM bookings b WHERE b.tenant_id = u.id) AS "bookingsTotal",
       (SELECT count(*)::int FROM bookings b WHERE b.tenant_id = u.id AND b.status = 'completed') AS "completedCount",
       (SELECT count(*)::int FROM bookings b WHERE b.tenant_id = u.id AND b.status = 'cancelled') AS "cancelledCount",
       (SELECT count(*)::int FROM penalties p JOIN bookings b ON b.id = p.booking_id WHERE b.tenant_id = u.id AND p.reason = 'late_return') AS "lateReturns",
       (SELECT COALESCE(sum(p.amount), 0)::float8 FROM penalties p JOIN bookings b ON b.id = p.booking_id WHERE b.tenant_id = u.id AND p.status = 'unpaid') AS "unpaidPenalties",
       (SELECT round(avg(rating), 2)::float8 FROM tenant_reviews WHERE tenant_id = u.id) AS "avgRating",
       EXISTS(SELECT 1 FROM blacklist_entries e WHERE e.tenant_id = u.id AND e.revoked_at IS NULL
         AND (e.expires_at IS NULL OR e.expires_at > now()) AND (e.owner_id IS NULL OR e.owner_id = $3)) AS "isBlacklisted"
       FROM users u WHERE u.id = $1 AND u.role = 'tenant' AND ($2 = 'admin' OR EXISTS(
         SELECT 1 FROM bookings b JOIN rooms r ON r.id = b.room_id WHERE b.tenant_id = u.id AND r.owner_id = $3))`,
      [id, actor.role, actor.id],
    );
    return rows[0];
  }
}
