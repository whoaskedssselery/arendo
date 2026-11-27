import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { DatabaseError } from 'pg';

/** Переводит ошибки PostgreSQL в понятные HTTP-ответы. Остальное пробрасывает как есть. */
export function rethrowDbError(error: unknown, conflict = 'Такая запись уже есть.'): never {
  if (!(error instanceof DatabaseError)) throw error;
  // Тексты P0001 заданы в db/02_logic.sql и уже написаны по-русски.
  if (error.code === 'P0001') throw new ConflictException(error.message);
  if (error.code === 'P0002') throw new NotFoundException('Запись не найдена.');
  if (error.code === '23505' || error.code === '23P01') throw new ConflictException(conflict);
  if (error.code === '23503') throw new ConflictException('Запись связана с другими данными.');
  if (error.code === '23514' || error.code === '22003') {
    throw new UnprocessableEntityException('Значения не проходят проверку.');
  }
  throw error;
}
