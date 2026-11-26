import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { BookingStatusScheduler } from './booking-status.scheduler';
import { BookingsController } from './bookings.controller';
import { BookingsRepository } from './bookings.repository';
import { BookingsService } from './bookings.service';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [BookingsController],
  providers: [BookingsRepository, BookingsService, BookingStatusScheduler],
})
export class BookingsModule {}
