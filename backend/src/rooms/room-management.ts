import {
  BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, Header,
  HttpCode, Injectable, NotFoundException, Param, Post, Req, UnprocessableEntityException,
  UploadedFile, UseInterceptors, UsePipes,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import type { AuthenticatedSession, UserRow } from '../auth/auth.types';
import { RequireRoles } from '../auth/require-roles.decorator';
import { PublicCache } from '../cache/public-cache.service';
import { DatabaseService } from '../database/database.service';
import { rethrowDbError } from '../http/db-errors';
import { IsDateTime } from '../http/date-time.decorator';
import { ResourceIdDto } from '../http/resource-id.dto';
import { validationPipe } from '../http/validation.pipe';

export const uploadDir = resolve(process.env.UPLOAD_DIR ?? join(__dirname, '../../uploads'));
export const uploadUrl = '/api/v1/uploads';
const maxPhotoBytes = 5 * 1024 * 1024;

/** Тип определяется по содержимому файла, а не по имени и заголовку клиента. */
export function imageExtension(data: Buffer): string | undefined {
  if (data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'jpg';
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return undefined;
}

class BlockDto {
  @IsDateTime() startAt!: string;
  @IsDateTime() endAt!: string;

  @IsOptional()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @Matches(/^[^\u0000]*$/u) @MaxLength(255)
  reason?: string;
}

class ChildIdDto extends ResourceIdDto {
  @Transform(({ value }) => typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value)
  @IsInt() @Min(1) @Max(Number.MAX_SAFE_INTEGER)
  childId!: number;
}

@Injectable()
export class RoomManagementRepository {
  constructor(private readonly db: DatabaseService) {}

  async ownerOf(roomId: number) {
    const { rows } = await this.db.pool.query<{ owner_id: string }>(
      'SELECT owner_id FROM rooms WHERE id = $1 AND is_active', [roomId],
    );
    return rows[0]?.owner_id;
  }

  /** Помещение не удаляется физически: история аренд и отзывы сохраняются. */
  deactivate(roomId: number) {
    return this.db.transaction(async (tx) => {
      await tx.query('SELECT id FROM rooms WHERE id = $1 FOR UPDATE', [roomId]);
      const busy = await tx.query(
        `SELECT 1 FROM bookings WHERE room_id = $1 AND status IN ('pending', 'active') LIMIT 1`, [roomId],
      );
      if (busy.rowCount) return false;
      await tx.query('UPDATE rooms SET is_active = FALSE WHERE id = $1', [roomId]);
      return true;
    });
  }

  addPhoto(roomId: number, url: string, isMain: boolean) {
    return this.db.transaction(async (tx) => {
      await tx.query('SELECT id FROM rooms WHERE id = $1 FOR UPDATE', [roomId]);
      const { rows: [stats] } = await tx.query<{ total: number; next: number }>(
        'SELECT count(*)::int AS total, COALESCE(max(sort_order) + 1, 0)::int AS next FROM room_photos WHERE room_id = $1',
        [roomId],
      );
      if (stats.total >= 10) throw new ConflictException('У помещения не больше 10 фото.');
      const main = isMain || stats.total === 0;
      if (main) await tx.query('UPDATE room_photos SET is_main = FALSE WHERE room_id = $1', [roomId]);
      const { rows } = await tx.query(
        `INSERT INTO room_photos (room_id, url, is_main, sort_order) VALUES ($1, $2, $3, $4)
         RETURNING id::int, url, is_main AS "isMain", sort_order AS "sortOrder"`,
        [roomId, url, main, stats.next],
      );
      return rows[0];
    });
  }

  removePhoto(roomId: number, photoId: number) {
    return this.db.transaction(async (tx) => {
      const { rows } = await tx.query<{ url: string; is_main: boolean }>(
        'DELETE FROM room_photos WHERE id = $2 AND room_id = $1 RETURNING url, is_main', [roomId, photoId],
      );
      if (rows[0]?.is_main) {
        await tx.query(
          `UPDATE room_photos SET is_main = TRUE WHERE id = (
             SELECT id FROM room_photos WHERE room_id = $1 ORDER BY sort_order, id LIMIT 1)`,
          [roomId],
        );
      }
      return rows[0]?.url;
    });
  }

  async blocks(roomId: number) {
    const { rows } = await this.db.pool.query(
      `SELECT id::int, start_at AS "startAt", end_at AS "endAt", reason FROM room_blocks
       WHERE room_id = $1 AND end_at > now() ORDER BY start_at`,
      [roomId],
    );
    return rows;
  }

  async addBlock(roomId: number, input: BlockDto) {
    const { rows } = await this.db.pool.query(
      `INSERT INTO room_blocks (room_id, start_at, end_at, reason) VALUES ($1, $2, $3, $4)
       RETURNING id::int, start_at AS "startAt", end_at AS "endAt", reason`,
      [roomId, input.startAt, input.endAt, input.reason || null],
    );
    return rows[0];
  }

  async removeBlock(roomId: number, blockId: number) {
    const { rowCount } = await this.db.pool.query(
      'DELETE FROM room_blocks WHERE id = $2 AND room_id = $1', [roomId, blockId],
    );
    return Boolean(rowCount);
  }
}

type Actor = { auth: AuthenticatedSession };

@Controller('rooms')
@UsePipes(validationPipe('Проверьте введённые данные.'))
export class RoomManagementController {
  constructor(private readonly repo: RoomManagementRepository, private readonly cache: PublicCache) {}

  @Delete(':id')
  @HttpCode(204)
  @RequireRoles('owner', 'admin')
  async deactivate(@Param() { id }: ResourceIdDto, @Req() req: Actor) {
    await this.own(id, req.auth.user);
    if (!(await this.repo.deactivate(id))) {
      throw new ConflictException('Сначала завершите или отмените аренды этого помещения.');
    }
    this.invalidate();
  }

  @Post(':id/photos')
  @RequireRoles('owner')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: maxPhotoBytes, files: 1, fields: 2 } }))
  async upload(
    @Param() { id }: ResourceIdDto,
    @Req() req: Actor,
    @UploadedFile() file: { buffer: Buffer } | undefined,
    @Body('isMain') isMain?: string,
  ) {
    await this.own(id, req.auth.user);
    if (!file) throw new BadRequestException('Приложите файл в поле file.');
    const extension = imageExtension(file.buffer);
    if (!extension) throw new UnprocessableEntityException('Нужен файл JPEG, PNG или WebP.');
    await mkdir(uploadDir, { recursive: true });
    const name = `${randomUUID()}.${extension}`;
    await writeFile(join(uploadDir, name), file.buffer, { flag: 'wx' });
    try {
      const photo = await this.repo.addPhoto(id, `${uploadUrl}/${name}`, isMain === 'true');
      this.invalidate();
      return photo;
    } catch (error) {
      await unlink(join(uploadDir, name)).catch(() => {});
      throw error;
    }
  }

  @Delete(':id/photos/:childId')
  @HttpCode(204)
  @RequireRoles('owner')
  async removePhoto(@Param() { id, childId }: ChildIdDto, @Req() req: Actor) {
    await this.own(id, req.auth.user);
    const url = await this.repo.removePhoto(id, childId);
    if (!url) throw new NotFoundException('Фото не найдено.');
    if (url.startsWith(`${uploadUrl}/`)) await unlink(join(uploadDir, basename(url))).catch(() => {});
    this.invalidate();
  }

  @Get(':id/blocks')
  @Header('Cache-Control', 'no-store')
  @RequireRoles('owner', 'admin')
  async blocks(@Param() { id }: ResourceIdDto, @Req() req: Actor) {
    await this.own(id, req.auth.user);
    return this.repo.blocks(id);
  }

  @Post(':id/blocks')
  @RequireRoles('owner', 'admin')
  async addBlock(@Param() { id }: ResourceIdDto, @Req() req: Actor, @Body() input: BlockDto) {
    await this.own(id, req.auth.user);
    if (!(new Date(input.startAt) < new Date(input.endAt)) || new Date(input.endAt) <= new Date()) {
      throw new UnprocessableEntityException('Период должен заканчиваться позже начала и в будущем.');
    }
    try {
      const block = await this.repo.addBlock(id, input);
      this.cache.invalidate('calendar', 'availability');
      return block;
    } catch (error) {
      rethrowDbError(error, 'Этот период уже закрыт.');
    }
  }

  @Delete(':id/blocks/:childId')
  @HttpCode(204)
  @RequireRoles('owner', 'admin')
  async removeBlock(@Param() { id, childId }: ChildIdDto, @Req() req: Actor) {
    await this.own(id, req.auth.user);
    if (!(await this.repo.removeBlock(id, childId))) throw new NotFoundException('Закрытие не найдено.');
    this.cache.invalidate('calendar', 'availability');
  }

  private async own(roomId: number, actor: UserRow) {
    const owner = await this.repo.ownerOf(roomId);
    if (!owner) throw new NotFoundException('Room not found.');
    if (actor.role !== 'admin' && owner !== actor.id) {
      throw new ForbiddenException('Это помещение другого владельца.');
    }
  }

  private invalidate() {
    this.cache.invalidate('catalog', 'availability', 'room', 'calendar');
  }
}
