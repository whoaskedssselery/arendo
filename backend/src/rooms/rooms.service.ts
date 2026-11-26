import { ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PublicCache } from '../cache/public-cache.service';
import type { CreateRoomDto, RoomPeriodDto, RoomQueryDto, UpdateRoomDto } from './rooms.dto';
import { RoomsRepository } from './rooms.repository';
import { type RoomPeriod, roomResponse } from './rooms.types';

function validatePeriod({ from, to }: RoomPeriodDto): RoomPeriod {
  if (!from || !to) throw new UnprocessableEntityException('Both from and to are required.');

  const start = new Date(from);
  const end = new Date(to);
  if (!(start < end) || start.getUTCFullYear() < 1) {
    throw new UnprocessableEntityException('The period must start before it ends.');
  }
  return [start, end];
}

function rethrowRoomWriteError(error: unknown): never {
  if (error && typeof error === 'object' && 'constraint' in error && error.constraint === 'rooms_category_id_fkey') {
    throw new UnprocessableEntityException('Room category does not exist.');
  }
  throw error;
}

@Injectable()
export class RoomsService {
  constructor(
    private readonly repository: RoomsRepository,
    private readonly cache: PublicCache,
  ) {}

  async list(query: RoomQueryDto) {
    if (query.priceMin !== undefined && query.priceMax !== undefined && query.priceMin > query.priceMax) {
      throw new UnprocessableEntityException('priceMin cannot exceed priceMax.');
    }
    const period = query.from !== undefined || query.to !== undefined ? validatePeriod(query) : undefined;
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const key = [query.categoryId, query.priceMin, query.priceMax, query.capacity,
      query.q || undefined, query.sort ?? 'price_asc', page, pageSize,
      period?.[0].toISOString(), period?.[1].toISOString()];
    return this.cache.read(period ? 'availability' : 'catalog', key, async () => {
      const { total, items } = await this.repository.list(query, period, page, pageSize);
      return { items: items.map(roomResponse), total: Number(total), page, pageSize };
    });
  }

  async find(id: number) {
    return this.cache.read('room', [id], async () => {
      const room = await this.repository.findPublicRoom(id);
      if (!room) throw new NotFoundException('Room not found.');
      return roomResponse(room);
    });
  }

  async calendar(id: number, query: RoomPeriodDto) {
    const period = validatePeriod(query);
    return this.cache.read('calendar', [id, ...period.map((date) => date.toISOString())], async () => {
      const rows = await this.repository.calendar(id, period);
      if (!rows.length) throw new NotFoundException('Room not found.');

      return rows.filter((slot) => slot.kind !== null).map((slot) => ({
        kind: slot.kind,
        startAt: slot.start_at.toISOString(),
        endAt: slot.end_at.toISOString(),
        status: slot.status,
      }));
    });
  }

  async create(ownerId: string, room: CreateRoomDto) {
    try {
      const created = await this.repository.create(ownerId, room);
      this.cache.invalidate('catalog', 'availability');
      return roomResponse(created);
    } catch (error) {
      rethrowRoomWriteError(error);
    }
  }

  async update(id: number, ownerId: string, room: UpdateRoomDto) {
    if (!Object.values(room).some((value) => value !== undefined)) {
      throw new UnprocessableEntityException('At least one room field must be supplied.');
    }

    try {
      const updated = await this.repository.update(id, ownerId, room);
      if (!updated) {
        if (!await this.repository.findPublicRoom(id)) throw new NotFoundException('Room not found.');
        throw new ForbiddenException('Only the room owner may update it.');
      }
      this.cache.invalidate('catalog', 'availability', 'room', 'calendar');
      return roomResponse(updated);
    } catch (error) {
      rethrowRoomWriteError(error);
    }
  }
}
