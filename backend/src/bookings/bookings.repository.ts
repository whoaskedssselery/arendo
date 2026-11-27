import { Injectable } from '@nestjs/common';
import type { UserRow } from '../auth/auth.types';
import type { BookingQueryDto } from './bookings.dto';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import type { BookingRow, BookingTarget } from './bookings.types';

@Injectable()
export class BookingsRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(actor: UserRow, query: BookingQueryDto): Promise<BookingRow[]> {
    const { rows } = await this.database.pool.query<BookingRow>(
      `SELECT b.id, b.room_id, b.tenant_id, b.start_at, b.end_at, b.status,
              b.total_price, b.actual_return_at,
              b.status = 'active' AND b.end_at < now() AS is_overdue,
              COALESCE((SELECT jsonb_agg(jsonb_build_object(
                'oldStatus', h.old_status, 'newStatus', h.new_status, 'changedAt', h.changed_at
              ) ORDER BY h.changed_at, h.id) FROM booking_status_history h WHERE h.booking_id = b.id), '[]'::jsonb) AS history
       FROM bookings b JOIN rooms r ON r.id = b.room_id
       WHERE ($1::text = 'admin' OR ($1 = 'tenant' AND b.tenant_id = $2::bigint)
              OR ($1 = 'owner' AND r.owner_id = $2::bigint))
         AND ($3::text IS NULL OR b.status::text = $3)
         AND ($4::bigint IS NULL OR b.room_id = $4)
       ORDER BY b.start_at DESC, b.id DESC LIMIT $5 OFFSET $6`,
      [
        actor.role,
        actor.id,
        query.status ?? null,
        query.roomId ?? null,
        query.pageSize ?? 20,
        ((query.page ?? 1) - 1) * (query.pageSize ?? 20),
      ],
    );
    return rows;
  }

  transactionAs<T>(actorId: string, run: (transaction: BookingTransaction) => Promise<T>): Promise<T> {
    return this.database.transaction(async (client) => {
      await client.query("SELECT set_config('arendo.user_id', $1, true)", [actorId]);
      return run(new BookingTransaction(client));
    });
  }

  async syncStatuses(): Promise<number> {
    const { rows } = await this.database.pool.query<{ updated: number }>(
      'SELECT fn_sync_booking_statuses() AS updated',
    );
    return rows[0].updated;
  }
}

export class BookingTransaction {
  constructor(private readonly client: PoolClient) {}

  async insert(tenantId: string, roomId: number, start: Date, end: Date, comment?: string) {
    const { rows } = await this.client.query<{ id: string }>(
      `INSERT INTO bookings (room_id, tenant_id, start_at, end_at, comment)
       SELECT r.id, $2::bigint, $3::timestamptz, $4::timestamptz, $5::text FROM rooms AS r WHERE r.id = $1
       RETURNING id`,
      [roomId, tenantId, start, end, comment],
    );
    return rows.at(0)?.id;
  }

  async lock(id: number) {
    const { rows } = await this.client.query<BookingTarget>(
      `SELECT b.tenant_id, r.owner_id, b.start_at, b.status, now() AS db_now
       FROM bookings AS b JOIN rooms AS r ON r.id = b.room_id
       WHERE b.id = $1
       FOR NO KEY UPDATE OF b`,
      [id],
    );
    return rows.at(0);
  }

  async cancel(id: number, reason?: string): Promise<void> {
    await this.client.query('SELECT fn_cancel_booking($1, $2)', [id, reason]);
  }

  async complete(id: number, tenantId: string, returnedAt?: Date): Promise<number> {
    // Completion counts the tenant's previous penalties before applying a warning or ban.
    await this.client.query('SELECT id FROM users WHERE id = $1 FOR NO KEY UPDATE', [tenantId]);

    const { rows } = await this.client.query<{ penalty_amount: string }>(
      'SELECT fn_complete_booking($1, COALESCE($2::timestamptz, now())) AS penalty_amount',
      [id, returnedAt],
    );
    return Number(rows[0].penalty_amount);
  }

  async findUpdated(id: number | string): Promise<BookingRow> {
    const { rows } = await this.client.query<BookingRow>(
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
}
