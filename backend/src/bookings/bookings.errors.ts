import { ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { DatabaseError } from 'pg';

export function rethrowBookingError(error: unknown): never {
  if (!(error instanceof DatabaseError)) throw error;

  if (error.code === '23P01' && error.constraint === 'bookings_no_overlap') {
    throw new ConflictException('Это время уже занято другой арендой.');
  }
  if (error.code === '23514' && error.constraint === 'bookings_max_length') {
    throw new UnprocessableEntityException('Аренда не может длиться больше 30 суток.');
  }
  if (error.code === '22003') {
    throw new UnprocessableEntityException('Сумма слишком велика.');
  }
  if (error.code === 'P0002') throw new NotFoundException('Booking not found.');

  // The existing SQL functions use P0001 for multiple business rules.
  if (error.code === 'P0001') {
    switch (error.message) {
      case 'Помещение закрыто владельцем на выбранный период':
        throw new ConflictException('Владелец закрыл помещение на это время.');
      case 'Нельзя изменить статус завершённой аренды':
      case 'Нельзя изменить статус отменённой аренды':
      case 'Нельзя завершить аренду, которая не начиналась':
        throw new ConflictException('Статус этой аренды так изменить нельзя.');
      case 'Арендатор находится в чёрном списке':
        throw new ForbiddenException('Вы в чёрном списке и не можете арендовать это помещение.');
      case 'Нельзя арендовать собственное помещение':
      case 'Арендовать помещения могут только арендаторы':
        throw new ForbiddenException('Это помещение вам арендовать нельзя.');
      case 'Помещение недоступно для аренды':
        throw new UnprocessableEntityException('Помещение недоступно для аренды.');
      case 'Нельзя арендовать помещение в прошлом':
        throw new UnprocessableEntityException('Нельзя арендовать в прошлом.');
      case 'Дата окончания должна быть позже даты начала':
        throw new UnprocessableEntityException('Окончание должно быть позже начала.');
    }
  }
  throw error;
}
