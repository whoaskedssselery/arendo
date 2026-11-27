import {
  Body, Controller, Delete, ForbiddenException, Get, Header, HttpCode, Injectable, Module,
  NotFoundException, Param, Patch, Post, Query, Req, UnprocessableEntityException, UsePipes,
} from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { AuthModule } from '../auth/auth.module';
import type { AuthenticatedSession, UserRow } from '../auth/auth.types';
import { RequireRoles } from '../auth/require-roles.decorator';
import { DatabaseModule } from '../database/database.module';
import { DatabaseService } from '../database/database.service';
import { rethrowDbError } from '../http/db-errors';
import { IsDateTime } from '../http/date-time.decorator';
import { ResourceIdDto } from '../http/resource-id.dto';
import { validationPipe } from '../http/validation.pipe';

class BlacklistDto {
  @IsInt() @Min(1) @Max(Number.MAX_SAFE_INTEGER) tenantId!: number;
  @IsIn(['warning', 'ban']) entryType!: 'warning' | 'ban';

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @IsNotEmpty() @Matches(/^[^\u0000]*$/u) @MaxLength(500)
  reason!: string;

  @IsOptional() @IsDateTime() expiresAt?: string;
}

class PenaltyStatusDto {
  @IsIn(['paid', 'waived']) status!: 'paid' | 'waived';
}

class PenaltyQueryDto {
  @IsOptional() @IsIn(['unpaid', 'paid', 'waived']) status?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(Number.MAX_SAFE_INTEGER) tenantId?: number;
}

const penaltyColumns = `p.id::int, p.booking_id::int AS "bookingId", p.reason, p.amount::float8, p.status,
  p.note, p.created_at AS "createdAt", b.tenant_id::int AS "tenantId", u.full_name AS "tenantName", r.title AS "roomTitle"`;
const entryColumns = `e.id::int, e.tenant_id::int AS "tenantId", u.full_name AS "tenantName", e.owner_id::int AS "ownerId",
  e.entry_type AS "entryType", e.reason, e.created_at AS "createdAt", e.expires_at AS "expiresAt"`;

@Injectable()
class ModerationRepository {
  constructor(private readonly db: DatabaseService) {}

  /** Владелец имеет дело только с теми, кто арендовал его помещения. */
  async isOwnersTenant(tenantId: number, actor: UserRow) {
    const { rowCount } = await this.db.pool.query(
      `SELECT 1 FROM users u WHERE u.id = $1 AND u.role = 'tenant' AND ($2 = 'admin' OR EXISTS (
         SELECT 1 FROM bookings b JOIN rooms r ON r.id = b.room_id WHERE b.tenant_id = u.id AND r.owner_id = $3))`,
      [tenantId, actor.role, actor.id],
    );
    return Boolean(rowCount);
  }

  async entries(actor: UserRow) {
    const { rows } = await this.db.pool.query(
      `SELECT ${entryColumns} FROM blacklist_entries e JOIN users u ON u.id = e.tenant_id
       WHERE e.revoked_at IS NULL AND (e.expires_at IS NULL OR e.expires_at > now())
         AND ($1 = 'admin' OR e.owner_id = $2)
       ORDER BY e.created_at DESC, e.id DESC LIMIT 200`,
      [actor.role, actor.id],
    );
    return rows;
  }

  async addEntry(input: BlacklistDto, actor: UserRow) {
    const { rows } = await this.db.pool.query(
      `WITH e AS (
         INSERT INTO blacklist_entries (tenant_id, owner_id, entry_type, reason, created_by, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
       ) SELECT ${entryColumns} FROM e JOIN users u ON u.id = e.tenant_id`,
      [input.tenantId, actor.role === 'admin' ? null : actor.id, input.entryType, input.reason, actor.id, input.expiresAt ?? null],
    );
    return rows[0];
  }

  /** Снимает запись. Если глобальных банов не осталось, учётная запись снова активна. */
  revoke(id: number, actor: UserRow) {
    return this.db.transaction(async (tx) => {
      const { rows } = await tx.query<{ tenant_id: string; owner_id: string | null }>(
        `UPDATE blacklist_entries SET revoked_at = now(), revoked_by = $2
         WHERE id = $1 AND revoked_at IS NULL AND ($3 = 'admin' OR owner_id = $2)
         RETURNING tenant_id, owner_id`,
        [id, actor.id, actor.role],
      );
      if (!rows[0]) return false;
      if (rows[0].owner_id === null) {
        await tx.query(
          `UPDATE users SET status = 'active' WHERE id = $1 AND NOT EXISTS (
             SELECT 1 FROM blacklist_entries WHERE tenant_id = $1 AND owner_id IS NULL AND entry_type = 'ban'
               AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now()))`,
          [rows[0].tenant_id],
        );
      }
      return true;
    });
  }

  async penalties(actor: UserRow, query: PenaltyQueryDto) {
    const { rows } = await this.db.pool.query(
      `SELECT ${penaltyColumns}
       FROM penalties p JOIN bookings b ON b.id = p.booking_id JOIN rooms r ON r.id = b.room_id
       JOIN users u ON u.id = b.tenant_id
       WHERE ($1 = 'admin' OR ($1 = 'owner' AND r.owner_id = $2) OR ($1 = 'tenant' AND b.tenant_id = $2))
         AND ($3::text IS NULL OR p.status::text = $3) AND ($4::bigint IS NULL OR b.tenant_id = $4)
       ORDER BY p.created_at DESC, p.id DESC LIMIT 200`,
      [actor.role, actor.id, query.status ?? null, query.tenantId ?? null],
    );
    return rows;
  }

  async settle(id: number, status: string, actor: UserRow) {
    const { rowCount } = await this.db.pool.query(
      `UPDATE penalties p SET status = $2 FROM bookings b JOIN rooms r ON r.id = b.room_id
       WHERE p.id = $1 AND b.id = p.booking_id AND p.status = 'unpaid' AND ($3 = 'admin' OR r.owner_id = $4)`,
      [id, status, actor.role, actor.id],
    );
    return Boolean(rowCount);
  }

  async tenants(actor: UserRow) {
    const { rows } = await this.db.pool.query(
      `SELECT s.tenant_id::int AS "tenantId", s.full_name AS "fullName", s.bookings_total::int AS "bookingsTotal",
              s.completed_count::int AS "completedCount", s.cancelled_count::int AS "cancelledCount",
              s.late_returns::int AS "lateReturns", s.unpaid_penalties::float8 AS "unpaidPenalties",
              s.avg_rating::float8 AS "avgRating", fn_is_blacklisted(s.tenant_id, $2) AS "isBlacklisted"
       FROM v_tenant_stats s
       WHERE $1 = 'admin' OR EXISTS (SELECT 1 FROM bookings b JOIN rooms r ON r.id = b.room_id
                                     WHERE b.tenant_id = s.tenant_id AND r.owner_id = $2)
       ORDER BY s.full_name LIMIT 200`,
      [actor.role, actor.role === 'owner' ? actor.id : null],
    );
    return rows;
  }
}

type Actor = { auth: AuthenticatedSession };

@Controller()
@UsePipes(validationPipe('Проверьте введённые данные.'))
class ModerationController {
  constructor(private readonly repo: ModerationRepository) {}

  @Get('tenants')
  @Header('Cache-Control', 'no-store')
  @RequireRoles('owner', 'admin')
  tenants(@Req() req: Actor) {
    return this.repo.tenants(req.auth.user);
  }

  @Get('blacklist')
  @Header('Cache-Control', 'no-store')
  @RequireRoles('owner', 'admin')
  entries(@Req() req: Actor) {
    return this.repo.entries(req.auth.user);
  }

  @Post('blacklist')
  @RequireRoles('owner', 'admin')
  async add(@Req() req: Actor, @Body() input: BlacklistDto) {
    if (input.expiresAt && new Date(input.expiresAt) <= new Date()) {
      throw new UnprocessableEntityException('Срок ограничения должен быть в будущем.');
    }
    if (!(await this.repo.isOwnersTenant(input.tenantId, req.auth.user))) {
      throw new ForbiddenException('Можно ограничить только своего арендатора.');
    }
    try {
      return await this.repo.addEntry(input, req.auth.user);
    } catch (error) {
      rethrowDbError(error);
    }
  }

  @Delete('blacklist/:id')
  @HttpCode(204)
  @RequireRoles('owner', 'admin')
  async revoke(@Param() { id }: ResourceIdDto, @Req() req: Actor) {
    if (!(await this.repo.revoke(id, req.auth.user))) throw new NotFoundException('Запись не найдена.');
  }

  @Get('penalties')
  @Header('Cache-Control', 'no-store')
  @RequireRoles('tenant', 'owner', 'admin')
  penalties(@Req() req: Actor, @Query() query: PenaltyQueryDto) {
    return this.repo.penalties(req.auth.user, query);
  }

  @Patch('penalties/:id')
  @RequireRoles('owner', 'admin')
  async settle(@Param() { id }: ResourceIdDto, @Req() req: Actor, @Body() input: PenaltyStatusDto) {
    if (!(await this.repo.settle(id, input.status, req.auth.user))) {
      throw new NotFoundException('Неоплаченный штраф не найден.');
    }
    return { id, status: input.status };
  }
}

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [ModerationController],
  providers: [ModerationRepository],
})
export class ModerationModule {}
