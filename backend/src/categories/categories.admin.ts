import { Body, Controller, Delete, HttpCode, NotFoundException, Param, Patch, Post, UsePipes } from '@nestjs/common';
import { PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { RequireRoles } from '../auth/require-roles.decorator';
import { PublicCache } from '../cache/public-cache.service';
import { DatabaseService } from '../database/database.service';
import { rethrowDbError } from '../http/db-errors';
import { ResourceIdDto } from '../http/resource-id.dto';
import { validationPipe } from '../http/validation.pipe';

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
    let category: unknown;
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
    this.cache.invalidate('categories');
    return category;
  }

  @Delete(':id')
  @HttpCode(204)
  @RequireRoles('admin')
  async remove(@Param() { id }: ResourceIdDto) {
    let removed: number | null = 0;
    try {
      removed = (await this.db.pool.query('DELETE FROM room_categories WHERE id = $1', [id])).rowCount;
    } catch (error) {
      rethrowDbError(error);
    }
    if (!removed) throw new NotFoundException('Категория не найдена.');
    this.cache.invalidate('categories');
  }
}
