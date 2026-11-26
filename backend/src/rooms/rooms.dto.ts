import { Transform, type TransformFnParams } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { IsDateTime } from '../http/date-time.decorator';

export const roomSorts = ['price_asc', 'price_desc', 'rating_desc', 'new'] as const;
export type RoomSort = (typeof roomSorts)[number];

function parseQueryNumber({ value }: TransformFnParams): unknown {
  if (typeof value === 'string' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) {
    return Number(value);
  }
  return value;
}

function trimText({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class RoomPeriodDto {
  @IsOptional()
  @IsDateTime()
  from?: string;

  @IsOptional()
  @IsDateTime()
  to?: string;
}

export class RoomQueryDto extends RoomPeriodDto {
  @IsOptional()
  @Transform(parseQueryNumber)
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  categoryId?: number;

  @IsOptional()
  @Transform(parseQueryNumber)
  @IsNumber()
  @Min(0)
  priceMin?: number;

  @IsOptional()
  @Transform(parseQueryNumber)
  @IsNumber()
  @Min(0)
  priceMax?: number;

  @IsOptional()
  @Transform(parseQueryNumber)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  capacity?: number;

  @IsOptional()
  @Transform(trimText)
  @IsString()
  @Matches(/^[^\u0000]*$/u)
  q?: string;

  @IsOptional()
  @IsIn(roomSorts)
  sort?: RoomSort;

  @IsOptional()
  @Transform(parseQueryNumber)
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  page?: number;

  @IsOptional()
  @Transform(parseQueryNumber)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class CreateRoomDto {
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  categoryId!: number;

  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @Matches(/^[^\u0000]*$/u)
  @MaxLength(150)
  title!: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Matches(/^[^\u0000]*$/u)
  description?: string;

  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @Matches(/^[^\u0000]*$/u)
  @MaxLength(255)
  address!: string;

  @IsNumber()
  @Min(0.01)
  @Max(999999.99)
  areaM2!: number;

  @IsInt()
  @Min(1)
  @Max(2147483647)
  capacity!: number;

  @IsNumber()
  @Min(0.01)
  @Max(99999999.99)
  pricePerHour!: number;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(99999999.99)
  pricePerDay?: number | null;
}
