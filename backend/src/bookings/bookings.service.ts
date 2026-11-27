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

  async create(tenantId: string, input: CreateBookingDto) {
    const start = new Date(input.startAt);
    const end = new Date(input.endAt);
    if (!(start < end)) {
      throw new UnprocessableEntityException('The booking must end after it starts.');
    }
    if (start.getTime() < Date.now()) {
      throw new UnprocessableEntityException('The booking cannot start in the past.');
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
        throw new ConflictException('A closed booking cannot be cancelled.');
      }
      if (actor.role === 'tenant' && (booking.status !== 'pending' || booking.start_at <= booking.db_now)) {
        throw new ForbiddenException('A tenant can only cancel a booking before it starts.');
      }
      if (actor.role === 'owner' && booking.status !== 'active') {
        throw new ForbiddenException('An owner can only cancel an active booking.');
      }

      await transaction.cancel(id, reason);
      return bookingResponse(await transaction.findUpdated(id));
    });
  }

  async complete(id: number, actor: UserRow, input: CompleteBookingDto) {
    const returnedAt = input.returnedAt === undefined ? undefined : new Date(input.returnedAt);
    return this.change(actor.id, async (transaction) => {
      const booking = await this.target(transaction, id, actor);
      if (booking.status !== 'active') throw new ConflictException('Only an active booking can be completed.');
      if (returnedAt && !(returnedAt >= booking.start_at && returnedAt <= booking.db_now)) {
        throw new UnprocessableEntityException('The return time must be between the start of the booking and now.');
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
