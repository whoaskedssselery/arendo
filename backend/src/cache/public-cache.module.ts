import { Module } from '@nestjs/common';
import { PublicCache } from './public-cache.service';

@Module({
  providers: [PublicCache],
  exports: [PublicCache],
})
export class PublicCacheModule {}
