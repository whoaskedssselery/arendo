import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { UserRow } from '../auth/auth.types';
import type { CancelBookingDto, CompleteBookingDto, CreateBookingDto } from './bookings.dto';
import { rethrowBookingError } from './bookings.errors';
import { BookingsRepository } from './bookings.repository';
import { bookingResponse } from './bookings.types';

@Injectable()
export class BookingsService {
  constructor(private readonly repository: BookingsRepository) {}

  async create(tenantId: string, input: CreateBookingDto) {
    const start = new Date(input.startAt);
    const end = new Date(input.endAt);
    if (!(start < end)) {
      throw new UnprocessableEntityException('The booking must end after it starts.');
    }
    if (start.getTime() < Date.now()) {
      throw new UnprocessableEntityException('The booking cannot start in the past.');
    }

    return this.change(tenantId, async (client) => {
      const id = await this.repository.insert(client, tenantId, input.roomId, start, end, input.comment);
      if (!id) throw new UnprocessableEntityException('Room not found.');
      return bookingResponse(await this.repository.findUpdated(client, id));
    });
  }

  async cancel(id: number, actor: UserRow, { reason }: CancelBookingDto) {
    return this.change(actor.id, async (client) => {
      const booking = await this.target(client, id, actor);
      if (booking.status === 'cancelled' || booking.status === 'completed') {
        throw new ConflictException('A closed booking cannot be cancelled.');
      }
      if (actor.role === 'tenant' && (booking.status !== 'pending' || booking.start_at <= booking.db_now)) {
        throw new ForbiddenException('A tenant can only cancel a booking before it starts.');
      }
      if (actor.role === 'owner' && booking.status !== 'active') {
        throw new ForbiddenException('An owner can only cancel an active booking.');
      }

      await this.repository.cancel(client, id, reason);
      return bookingResponse(await this.repository.findUpdated(client, id));
    });
  }

  async complete(id: number, actor: UserRow, input: CompleteBookingDto) {
    const returnedAt = input.returnedAt === undefined ? undefined : new Date(input.returnedAt);
    return this.change(actor.id, async (client) => {
      const booking = await this.target(client, id, actor);
      if (booking.status !== 'active') throw new ConflictException('Only an active booking can be completed.');
      if (returnedAt && !(returnedAt >= booking.start_at && returnedAt <= booking.db_now)) {
        throw new UnprocessableEntityException('The return time must be between the start of the booking and now.');
      }

      await this.repository.lockTenant(client, booking.tenant_id);
      const penaltyAmount = await this.repository.complete(client, id, returnedAt);
      return { booking: bookingResponse(await this.repository.findUpdated(client, id)), penaltyAmount };
    });
  }

  private async target(client: PoolClient, id: number, actor: UserRow) {
    const booking = await this.repository.lock(client, id);
    if (!booking) throw new NotFoundException('Booking not found.');
    if ((actor.role === 'tenant' && actor.id !== booking.tenant_id)
      || (actor.role === 'owner' && actor.id !== booking.owner_id)) {
      throw new ForbiddenException('The user cannot access this booking.');
    }
    return booking;
  }

  private async change<T>(actorId: string, run: (client: PoolClient) => Promise<T>): Promise<T> {
    try {
      return await this.repository.transactionAs(actorId, run);
    } catch (error) {
      rethrowBookingError(error);
    }
  }
}
