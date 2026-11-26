import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import type { BookingRow, BookingTarget } from './bookings.types';

@Injectable()
export class BookingsRepository {
  constructor(private readonly database: DatabaseService) {}

  transactionAs<T>(actorId: string, run: (client: PoolClient) => Promise<T>): Promise<T> {
    return this.database.transaction(async (client) => {
      await client.query("SELECT set_config('arendo.user_id', $1, true)", [actorId]);
      return run(client);
    });
  }

  async insert(client: PoolClient, tenantId: string, roomId: number, start: Date, end: Date, comment?: string) {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO bookings (room_id, tenant_id, start_at, end_at, comment)
       SELECT r.id, $2::bigint, $3::timestamptz, $4::timestamptz, $5::text FROM rooms AS r WHERE r.id = $1
       RETURNING id`,
      [roomId, tenantId, start, end, comment],
    );
    return rows.at(0)?.id;
  }

  async lock(client: PoolClient, id: number) {
    const { rows } = await client.query<BookingTarget>(
      `SELECT b.tenant_id, r.owner_id, b.start_at, b.status, now() AS db_now
       FROM bookings AS b JOIN rooms AS r ON r.id = b.room_id
       WHERE b.id = $1
       FOR NO KEY UPDATE OF b`,
      [id],
    );
    return rows.at(0);
  }

  async cancel(client: PoolClient, id: number, reason?: string): Promise<void> {
    await client.query('SELECT fn_cancel_booking($1, $2)', [id, reason]);
  }

  async complete(client: PoolClient, id: number, returnedAt?: Date): Promise<number> {
    const { rows } = await client.query<{ penalty_amount: string }>(
      'SELECT fn_complete_booking($1, COALESCE($2::timestamptz, now())) AS penalty_amount',
      [id, returnedAt],
    );
    return Number(rows[0].penalty_amount);
  }

  async lockTenant(client: PoolClient, tenantId: string): Promise<void> {
    // Completion counts the tenant's previous penalties before applying a warning or ban.
    await client.query('SELECT id FROM users WHERE id = $1 FOR NO KEY UPDATE', [tenantId]);
  }

  async findUpdated(client: PoolClient, id: number | string): Promise<BookingRow> {
    const { rows } = await client.query<BookingRow>(
      `SELECT b.id, b.room_id, b.tenant_id, b.start_at, b.end_at, b.status, b.total_price, b.actual_return_at,
              b.status = 'active' AND b.end_at < now() AS is_overdue,
              COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                  'oldStatus', h.old_status, 'newStatus', h.new_status, 'changedAt', h.changed_at
                ) ORDER BY h.changed_at, h.id)
                FROM booking_status_history AS h WHERE h.booking_id = b.id
              ), '[]'::jsonb) AS history
       FROM bookings AS b WHERE b.id = $1`,
      [id],
    );
    return rows[0];
  }

  async syncStatuses(): Promise<number> {
    const { rows } = await this.database.pool.query<{ updated: number }>(
      'SELECT fn_sync_booking_statuses() AS updated',
    );
    return rows[0].updated;
  }
}
