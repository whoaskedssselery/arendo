import { ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { DatabaseError } from 'pg';

export function rethrowBookingError(error: unknown): never {
  if (!(error instanceof DatabaseError)) throw error;

  if (error.code === '23P01' && error.constraint === 'bookings_no_overlap') {
    throw new ConflictException('The period overlaps another booking.');
  }
  if (error.code === '23514' && error.constraint === 'bookings_max_length') {
    throw new UnprocessableEntityException('A booking cannot exceed 30 days.');
  }
  if (error.code === '22003') {
    throw new UnprocessableEntityException('The calculated amount exceeds the supported range.');
  }
  if (error.code === 'P0002') throw new NotFoundException('Booking not found.');

  // The existing SQL functions use P0001 for multiple business rules.
  if (error.code === 'P0001') {
    switch (error.message) {
      case 'Помещение закрыто владельцем на выбранный период':
        throw new ConflictException('The room is blocked for the selected period.');
      case 'Нельзя изменить статус завершённой аренды':
      case 'Нельзя изменить статус отменённой аренды':
      case 'Нельзя завершить аренду, которая не начиналась':
        throw new ConflictException('The booking cannot change to the requested status.');
      case 'Арендатор находится в чёрном списке':
        throw new ForbiddenException('The tenant is blocked from booking this room.');
      case 'Нельзя арендовать собственное помещение':
      case 'Арендовать помещения могут только арендаторы':
        throw new ForbiddenException('The user may not book this room.');
      case 'Помещение недоступно для аренды':
        throw new UnprocessableEntityException('The room is unavailable for booking.');
      case 'Нельзя арендовать помещение в прошлом':
        throw new UnprocessableEntityException('The booking cannot start in the past.');
      case 'Дата окончания должна быть позже даты начала':
        throw new UnprocessableEntityException('The booking must end after it starts.');
    }
  }
  throw error;
}
