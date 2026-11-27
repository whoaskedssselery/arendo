import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsInt, IsString, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { IsDateTime } from '../http/date-time.decorator';

export class CreateBookingDto {
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  roomId!: number;

  @IsDateTime()
  startAt!: string;

  @IsDateTime()
  endAt!: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Matches(/^[^\u0000]*$/u)
  @MaxLength(500)
  comment?: string;
}

export class CancelBookingDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Matches(/^[^\u0000]*$/u)
  @MaxLength(255)
  reason?: string;
}

export class CompleteBookingDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsDateTime()
  returnedAt?: string;
}

export class BookingQueryDto {
  @IsOptional()
  @IsIn(['pending', 'active', 'completed', 'cancelled'])
  status?: 'pending' | 'active' | 'completed' | 'cancelled';
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  roomId?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  page?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
