import {
  BadRequestException, Body, Controller, Delete, HttpCode, NotFoundException, Param, Patch, Post,
  UnprocessableEntityException, UploadedFile, UseInterceptors, UsePipes,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { RequireRoles } from '../auth/require-roles.decorator';
import { PublicCache } from '../cache/public-cache.service';
import { DatabaseService } from '../database/database.service';
import { rethrowDbError } from '../http/db-errors';
import { ResourceIdDto } from '../http/resource-id.dto';
import { validationPipe } from '../http/validation.pipe';
import { imageExtension, uploadDir, uploadUrl } from '../rooms/room-management';

class CategoryDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @IsNotEmpty() @Matches(/^[^\u0000]*$/u) @MaxLength(100)
  name!: string;

  @IsOptional() @IsString() @Matches(/^[^\u0000]*$/u) @MaxLength(1000)
  description?: string;

  @IsOptional() @IsString() @Matches(/^(\/|https:\/\/)[^\s\u0000]*$/u) @MaxLength(500)
  photoUrl?: string;

  @IsNumber() @Min(0) @Max(99999999.99)
  basePricePerHour!: number;
}
class UpdateCategoryDto extends PartialType(CategoryDto) {}

const columns = `id::int, name, description, photo_url AS "photoUrl", base_price_per_hour::float8 AS "basePricePerHour"`;
const duplicate = 'Категория с таким названием уже есть.';
const maxIconBytes = 512 * 1024;
// Удаляются только файлы иконок: у них своя приставка, фото помещений не затрагиваются.
const iconPrefix = `${uploadUrl}/icon-`;
const removeIconFile = async (url?: string | null) => {
  if (url?.startsWith(iconPrefix)) await unlink(join(uploadDir, basename(url))).catch(() => {});
};

@Controller('categories')
@UsePipes(validationPipe('Проверьте поля категории.'))
export class CategoriesAdminController {
  constructor(private readonly db: DatabaseService, private readonly cache: PublicCache) {}

  @Post()
  @RequireRoles('admin')
  async create(@Body() input: CategoryDto) {
    try {
      const { rows } = await this.db.pool.query(
        `INSERT INTO room_categories (name, description, photo_url, base_price_per_hour)
         VALUES ($1, $2, $3, $4) RETURNING ${columns}`,
        [input.name, input.description ?? null, input.photoUrl ?? null, input.basePricePerHour],
      );
      this.cache.invalidate('categories');
      return rows[0];
    } catch (error) {
      rethrowDbError(error, duplicate);
    }
  }

  @Patch(':id')
  @RequireRoles('admin')
  async update(@Param() { id }: ResourceIdDto, @Body() input: UpdateCategoryDto) {
    let category: { photoUrl: string | null } | undefined;
    const previous = await this.iconOf(id);
    try {
      const { rows } = await this.db.pool.query(
        `UPDATE room_categories SET name = COALESCE($2, name), description = COALESCE($3, description),
           photo_url = COALESCE($4, photo_url), base_price_per_hour = COALESCE($5, base_price_per_hour)
         WHERE id = $1 RETURNING ${columns}`,
        [id, input.name, input.description, input.photoUrl, input.basePricePerHour],
      );
      category = rows[0];
    } catch (error) {
      rethrowDbError(error, duplicate);
    }
    if (!category) throw new NotFoundException('Категория не найдена.');
    if (previous !== category.photoUrl) await removeIconFile(previous);
    this.cache.invalidate('categories');
    return category;
  }

  @Post(':id/icon')
  @RequireRoles('admin')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: maxIconBytes, files: 1, fields: 0 } }))
  async uploadIcon(@Param() { id }: ResourceIdDto, @UploadedFile() file: { buffer: Buffer } | undefined) {
    if (!file) throw new BadRequestException('Приложите файл в поле file.');
    const extension = imageExtension(file.buffer);
    if (!extension) throw new UnprocessableEntityException('Нужен файл JPEG, PNG или WebP.');
    const previous = await this.iconOf(id);
    if (previous === undefined) throw new NotFoundException('Категория не найдена.');
    const name = `icon-${randomUUID()}.${extension}`;
    const url = `${uploadUrl}/${name}`;
    await mkdir(uploadDir, { recursive: true });
    await writeFile(join(uploadDir, name), file.buffer, { flag: 'wx' });
    const { rows } = await this.db.pool.query(
      `UPDATE room_categories SET photo_url = $2 WHERE id = $1 RETURNING ${columns}`, [id, url],
    );
    if (!rows[0]) {
      await removeIconFile(url);
      throw new NotFoundException('Категория не найдена.');
    }
    await removeIconFile(previous);
    this.cache.invalidate('categories');
    return rows[0];
  }

  @Delete(':id')
  @HttpCode(204)
  @RequireRoles('admin')
  async remove(@Param() { id }: ResourceIdDto) {
    let removed: number | null = 0;
    const previous = await this.iconOf(id);
    try {
      removed = (await this.db.pool.query('DELETE FROM room_categories WHERE id = $1', [id])).rowCount;
    } catch (error) {
      rethrowDbError(error);
    }
    if (!removed) throw new NotFoundException('Категория не найдена.');
    await removeIconFile(previous);
    this.cache.invalidate('categories');
  }

  /** undefined — категории нет, null — иконка не задана. */
  private async iconOf(id: number) {
    const { rows } = await this.db.pool.query<{ photo_url: string | null }>(
      'SELECT photo_url FROM room_categories WHERE id = $1', [id],
    );
    return rows[0]?.photo_url;
  }
}
