import { Module } from '@nestjs/common';
import { PublicCacheModule } from '../cache/public-cache.module';
import { DatabaseModule } from '../database/database.module';
import { CategoriesController } from './categories.controller';
import { CategoriesRepository } from './categories.repository';
import { CategoriesService } from './categories.service';

@Module({
  imports: [DatabaseModule, PublicCacheModule],
  controllers: [CategoriesController],
  providers: [CategoriesRepository, CategoriesService],
})
export class CategoriesModule {}
