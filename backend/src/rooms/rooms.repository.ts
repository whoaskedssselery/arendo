import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { CreateRoomDto, RoomQueryDto, RoomSort } from './rooms.dto';
import type { BusySlotRow, RoomPeriod, RoomRow } from './rooms.types';

const roomColumns = `r.id, r.owner_id, r.category_id, r.title, r.description, r.address,
  r.area_m2, r.capacity, r.price_per_hour, r.price_per_day, r.is_active`;

const sortSql: Record<RoomSort, string> = {
  price_asc: 'price_per_hour ASC, id ASC',
  price_desc: 'price_per_hour DESC, id ASC',
  rating_desc: 'avg_rating DESC NULLS LAST, id ASC',
  new: 'created_at DESC, id DESC',
};

function roomPhotos(roomId: 'r.id' | 'filtered.id'): string {
  return `(
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', p.id, 'url', p.url, 'isMain', p.is_main, 'sortOrder', p.sort_order
    ) ORDER BY p.is_main DESC, p.sort_order, p.id), '[]'::jsonb)
    FROM room_photos AS p WHERE p.room_id = ${roomId}
  ) AS photos`;
}

@Injectable()
export class RoomsRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(query: RoomQueryDto, period: RoomPeriod | undefined, page: number, pageSize: number) {
    const orderBy = sortSql[query.sort ?? 'price_asc'];
    const offset = BigInt(page - 1) * BigInt(pageSize);
    const { rows } = await this.database.pool.query<{ total: string; items: RoomRow[] }>(
      `WITH filtered AS (
         SELECT ${roomColumns}, r.created_at, rating.avg_rating, rating.reviews_count
         FROM rooms AS r
         JOIN v_room_rating AS rating ON rating.room_id = r.id
         WHERE r.is_active
           AND ($1::bigint IS NULL OR r.category_id = $1)
           AND ($2::numeric IS NULL OR r.price_per_hour >= $2)
           AND ($3::numeric IS NULL OR r.price_per_hour <= $3)
           AND ($4::int IS NULL OR r.capacity >= $4)
           AND ($5::timestamptz IS NULL OR fn_room_is_free(r.id, $5, $6::timestamptz))
           AND ($7::text IS NULL OR strpos(lower(r.title), lower($7)) > 0
                                OR strpos(lower(r.address), lower($7)) > 0)
       ), page AS (
         SELECT filtered.*, ${roomPhotos('filtered.id')}
         FROM filtered
         ORDER BY ${orderBy}
         LIMIT $8 OFFSET $9
       )
       SELECT (SELECT count(*) FROM filtered) AS total,
              COALESCE(jsonb_agg(page ORDER BY ${orderBy}), '[]'::jsonb) AS items
       FROM page`,
      [query.categoryId, query.priceMin, query.priceMax, query.capacity,
        period?.[0], period?.[1], query.q || null, pageSize, offset.toString()],
    );
    return rows[0];
  }

  async findPublicRoom(id: number) {
    const { rows } = await this.database.pool.query<RoomRow>(
      `SELECT ${roomColumns}, rating.avg_rating, rating.reviews_count, ${roomPhotos('r.id')}
       FROM rooms AS r
       JOIN v_room_rating AS rating ON rating.room_id = r.id
       WHERE r.id = $1 AND r.is_active`,
      [id],
    );
    return rows.at(0);
  }

  async calendar(id: number, [from, to]: RoomPeriod) {
    const { rows } = await this.database.pool.query<BusySlotRow | { kind: null }>(
      `SELECT slot.kind, slot.start_at, slot.end_at, slot.status
       FROM rooms AS r
       LEFT JOIN LATERAL fn_room_busy_slots(r.id, $2, $3) AS slot ON true
       WHERE r.id = $1 AND r.is_active
       ORDER BY slot.start_at, slot.end_at, slot.kind`,
      [id, from, to],
    );
    return rows;
  }

  async create(ownerId: string, room: CreateRoomDto): Promise<RoomRow> {
    const { rows } = await this.database.pool.query<RoomRow>(
      `INSERT INTO rooms AS r (
         owner_id, category_id, title, description, address, area_m2, capacity, price_per_hour, price_per_day
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${roomColumns}, NULL AS avg_rating, 0 AS reviews_count, '[]'::jsonb AS photos`,
      [ownerId, room.categoryId, room.title, room.description, room.address,
        room.areaM2, room.capacity, room.pricePerHour, room.pricePerDay],
    );
    return rows[0];
  }
}
