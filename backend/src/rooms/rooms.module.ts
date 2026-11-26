import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PublicCacheModule } from '../cache/public-cache.module';
import { DatabaseModule } from '../database/database.module';
import { RoomsController } from './rooms.controller';
import { RoomsRepository } from './rooms.repository';
import { RoomsService } from './rooms.service';

@Module({
  imports: [DatabaseModule, AuthModule, PublicCacheModule],
  controllers: [RoomsController],
  providers: [RoomsRepository, RoomsService],
})
export class RoomsModule {}
