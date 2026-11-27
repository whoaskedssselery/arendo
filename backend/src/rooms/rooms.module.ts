import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PublicCacheModule } from '../cache/public-cache.module';
import { DatabaseModule } from '../database/database.module';
import { RoomManagementController, RoomManagementRepository } from './room-management';
import { RoomsController } from './rooms.controller';
import { RoomsRepository } from './rooms.repository';
import { RoomsService } from './rooms.service';

@Module({
  imports: [DatabaseModule, AuthModule, PublicCacheModule],
  controllers: [RoomsController, RoomManagementController],
  providers: [RoomsRepository, RoomsService, RoomManagementRepository],
})
export class RoomsModule {}
