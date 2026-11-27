import { Module } from '@nestjs/common';
import { PublicCacheModule } from '../cache/public-cache.module';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { CategoriesAdminController } from './categories.admin';
import { CategoriesController } from './categories.controller';
import { CategoriesRepository } from './categories.repository';
import { CategoriesService } from './categories.service';

@Module({
  imports: [DatabaseModule, PublicCacheModule, AuthModule],
  controllers: [CategoriesController, CategoriesAdminController],
  providers: [CategoriesRepository, CategoriesService],
})
export class CategoriesModule {}
