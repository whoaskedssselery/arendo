import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { CreateRoomDto, RoomPeriodDto, RoomQueryDto } from './rooms.dto';
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

@Injectable()
export class RoomsService {
  constructor(private readonly repository: RoomsRepository) {}

  async list(query: RoomQueryDto) {
    if (query.priceMin !== undefined && query.priceMax !== undefined && query.priceMin > query.priceMax) {
      throw new UnprocessableEntityException('priceMin cannot exceed priceMax.');
    }
    const period = query.from !== undefined || query.to !== undefined ? validatePeriod(query) : undefined;
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const { total, items } = await this.repository.list(query, period, page, pageSize);
    return { items: items.map(roomResponse), total: Number(total), page, pageSize };
  }

  async find(id: number) {
    const room = await this.repository.findPublicRoom(id);
    if (!room) throw new NotFoundException('Room not found.');
    return roomResponse(room);
  }

  async calendar(id: number, query: RoomPeriodDto) {
    const rows = await this.repository.calendar(id, validatePeriod(query));
    if (!rows.length) throw new NotFoundException('Room not found.');

    return rows.filter((slot) => slot.kind !== null).map((slot) => ({
      kind: slot.kind,
      startAt: slot.start_at.toISOString(),
      endAt: slot.end_at.toISOString(),
      status: slot.status,
    }));
  }

  async create(ownerId: string, room: CreateRoomDto) {
    try {
      return roomResponse(await this.repository.create(ownerId, room));
    } catch (error) {
      if (error && typeof error === 'object' && 'constraint' in error && error.constraint === 'rooms_category_id_fkey') {
        throw new UnprocessableEntityException('Room category does not exist.');
      }
      throw error;
    }
  }
}
