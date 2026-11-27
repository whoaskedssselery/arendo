import {
  Body, Controller, ForbiddenException, Get, Header, Injectable, Module, NotFoundException,
  Param, Post, Query, Req, UsePipes,
} from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { AuthModule } from '../auth/auth.module';
import type { AuthenticatedSession, UserRow } from '../auth/auth.types';
import { RequireRoles } from '../auth/require-roles.decorator';
import { PublicCacheModule } from '../cache/public-cache.module';
import { PublicCache } from '../cache/public-cache.service';
import { DatabaseModule } from '../database/database.module';
import { DatabaseService } from '../database/database.service';
import { rethrowDbError } from '../http/db-errors';
import { ResourceIdDto } from '../http/resource-id.dto';
import { validationPipe } from '../http/validation.pipe';

class ReviewDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Matches(/^[^\u0000]*$/u)
  @MaxLength(1000)
  comment?: string;
}

class PageDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000000) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}

@Injectable()
class ReviewsRepository {
  constructor(private readonly db: DatabaseService) {}

  async booking(id: number) {
    const { rows } = await this.db.pool.query<{ tenant_id: string; owner_id: string; room_id: string }>(
      `SELECT b.tenant_id, r.owner_id, b.room_id FROM bookings b JOIN rooms r ON r.id = b.room_id WHERE b.id = $1`,
      [id],
    );
    return rows.at(0);
  }

  async addRoomReview(bookingId: number, roomId: string, tenantId: string, input: ReviewDto) {
    const { rows } = await this.db.pool.query(
      `INSERT INTO reviews (booking_id, room_id, tenant_id, rating, comment) VALUES ($1, $2, $3, $4, $5)
       RETURNING id::int, booking_id::int AS "bookingId", rating, comment, created_at AS "createdAt"`,
      [bookingId, roomId, tenantId, input.rating, input.comment || null],
    );
    return rows[0];
  }

  async addTenantReview(bookingId: number, tenantId: string, ownerId: string, input: ReviewDto) {
    const { rows } = await this.db.pool.query(
      `INSERT INTO tenant_reviews (booking_id, tenant_id, owner_id, rating, comment) VALUES ($1, $2, $3, $4, $5)
       RETURNING id::int, booking_id::int AS "bookingId", rating, comment, created_at AS "createdAt"`,
      [bookingId, tenantId, ownerId, input.rating, input.comment || null],
    );
    return rows[0];
  }

  async forRoom(roomId: number, page: number, pageSize: number) {
    const { rows } = await this.db.pool.query(
      `SELECT rv.id::int, rv.booking_id::int AS "bookingId", u.full_name AS author, rv.rating, rv.comment,
              rv.created_at AS "createdAt"
       FROM reviews rv JOIN users u ON u.id = rv.tenant_id
       WHERE rv.room_id = $1 ORDER BY rv.created_at DESC, rv.id DESC LIMIT $2 OFFSET $3`,
      [roomId, pageSize, (page - 1) * pageSize],
    );
    return rows;
  }
}

@Controller()
@UsePipes(validationPipe('Проверьте оценку и текст отзыва.'))
class ReviewsController {
  constructor(private readonly reviews: ReviewsRepository, private readonly cache: PublicCache) {}

  @Get('rooms/:id/reviews')
  @Header('Cache-Control', 'no-cache')
  list(@Param() { id }: ResourceIdDto, @Query() query: PageDto) {
    return this.reviews.forRoom(id, query.page ?? 1, query.pageSize ?? 20);
  }

  @Post('bookings/:id/review')
  @RequireRoles('tenant')
  async review(@Param() { id }: ResourceIdDto, @Req() req: { auth: AuthenticatedSession }, @Body() input: ReviewDto) {
    const booking = await this.own(id, req.auth.user, 'tenant_id');
    try {
      const created = await this.reviews.addRoomReview(id, booking.room_id, booking.tenant_id, input);
      this.cache.invalidate('room', 'catalog', 'availability');
      return created;
    } catch (error) {
      rethrowDbError(error, 'Отзыв по этой аренде уже оставлен.');
    }
  }

  @Post('bookings/:id/tenant-review')
  @RequireRoles('owner')
  async rate(@Param() { id }: ResourceIdDto, @Req() req: { auth: AuthenticatedSession }, @Body() input: ReviewDto) {
    const booking = await this.own(id, req.auth.user, 'owner_id');
    try {
      return await this.reviews.addTenantReview(id, booking.tenant_id, booking.owner_id, input);
    } catch (error) {
      rethrowDbError(error, 'Арендатор по этой аренде уже оценён.');
    }
  }

  private async own(id: number, actor: UserRow, column: 'tenant_id' | 'owner_id') {
    const booking = await this.reviews.booking(id);
    if (!booking) throw new NotFoundException('Booking not found.');
    if (booking[column] !== actor.id) throw new ForbiddenException('Это не ваша аренда.');
    return booking;
  }
}

@Module({
  imports: [DatabaseModule, AuthModule, PublicCacheModule],
  controllers: [ReviewsController],
  providers: [ReviewsRepository],
})
export class ReviewsModule {}
