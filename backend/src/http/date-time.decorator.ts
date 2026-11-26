import { applyDecorators } from '@nestjs/common';
import { IsISO8601, IsRFC3339 } from 'class-validator';

export function IsDateTime() {
  return applyDecorators(IsRFC3339(), IsISO8601({ strict: true, strictSeparator: true }));
}
