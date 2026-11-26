import { applyDecorators, Header } from '@nestjs/common';

export const publicCacheControl = 'public, no-cache';

export function PublicCacheHeaders() {
  return applyDecorators(
    Header('Cache-Control', publicCacheControl),
    Header('Vary', 'Accept-Encoding'),
  );
}
