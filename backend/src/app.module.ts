import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { BookingsModule } from './bookings/bookings.module';
import { DatabaseModule } from './database/database.module';
import { RoomsModule } from './rooms/rooms.module';

@Module({
  imports: [
    CacheModule.register({ isGlobal: true }),
    DatabaseModule,
    AuthModule,
    RoomsModule,
    BookingsModule,
  ],
})
export class AppModule {}
