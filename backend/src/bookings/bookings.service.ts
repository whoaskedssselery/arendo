import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { UserRow } from '../auth/auth.types';
import { PublicCache } from '../cache/public-cache.service';
import type { BookingQueryDto, CancelBookingDto, CompleteBookingDto, CreateBookingDto } from './bookings.dto';
import { rethrowBookingError } from './bookings.errors';
import { BookingsRepository, type BookingTransaction } from './bookings.repository';
import { bookingResponse } from './bookings.types';

@Injectable()
export class BookingsService {
  constructor(
    private readonly repository: BookingsRepository,
    private readonly cache: PublicCache,
  ) {}

  async list(actor: UserRow, query: BookingQueryDto) {
    return (await this.repository.list(actor, query)).map(bookingResponse);
  }

  async find(id: number, actor: UserRow) {
    const booking = await this.repository.find(id, actor);
    if (!booking) throw new NotFoundException('Booking not found.');
    return bookingResponse(booking);
  }

  async create(tenantId: string, input: CreateBookingDto) {
    const start = new Date(input.startAt);
    const end = new Date(input.endAt);
    if (!(start < end)) {
      throw new UnprocessableEntityException('Окончание должно быть позже начала.');
    }
    if (start.getTime() < Date.now()) {
      throw new UnprocessableEntityException('Нельзя арендовать в прошлом.');
    }

    return this.change(tenantId, async (transaction) => {
      const id = await transaction.insert(tenantId, input.roomId, start, end, input.comment);
      if (!id) throw new UnprocessableEntityException('Room not found.');
      return bookingResponse(await transaction.findUpdated(id));
    });
  }

  async cancel(id: number, actor: UserRow, { reason }: CancelBookingDto) {
    return this.change(actor.id, async (transaction) => {
      const booking = await this.target(transaction, id, actor);
      if (booking.status === 'cancelled' || booking.status === 'completed') {
        throw new ConflictException('Закрытую аренду отменить нельзя.');
      }
      if (actor.role === 'tenant' && (booking.status !== 'pending' || booking.start_at <= booking.db_now)) {
        throw new ForbiddenException('Отменить аренду можно только до её начала.');
      }
      if (actor.role === 'owner' && booking.status !== 'active') {
        throw new ForbiddenException('Владелец может отменить только активную аренду.');
      }

      await transaction.cancel(id, reason);
      return bookingResponse(await transaction.findUpdated(id));
    });
  }

  async complete(id: number, actor: UserRow, input: CompleteBookingDto) {
    const returnedAt = input.returnedAt === undefined ? undefined : new Date(input.returnedAt);
    return this.change(actor.id, async (transaction) => {
      const booking = await this.target(transaction, id, actor);
      if (booking.status !== 'active') throw new ConflictException('Завершить можно только активную аренду.');
      if (returnedAt && !(returnedAt >= booking.start_at && returnedAt <= booking.db_now)) {
        throw new UnprocessableEntityException('Время возврата должно быть между началом аренды и текущим моментом.');
      }

      const penaltyAmount = await transaction.complete(id, booking.tenant_id, returnedAt);
      return { booking: bookingResponse(await transaction.findUpdated(id)), penaltyAmount };
    });
  }

  private async target(transaction: BookingTransaction, id: number, actor: UserRow) {
    const booking = await transaction.lock(id);
    if (!booking) throw new NotFoundException('Booking not found.');
    if ((actor.role === 'tenant' && actor.id !== booking.tenant_id)
      || (actor.role === 'owner' && actor.id !== booking.owner_id)) {
      throw new ForbiddenException('The user cannot access this booking.');
    }
    return booking;
  }

  private async change<T>(actorId: string, run: (transaction: BookingTransaction) => Promise<T>): Promise<T> {
    try {
      const result = await this.repository.transactionAs(actorId, run);
      this.cache.invalidate('availability', 'calendar');
      return result;
    } catch (error) {
      rethrowBookingError(error);
    }
  }
}
