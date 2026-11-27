import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { KeyvCacheableMemory } from 'cacheable';
import { AuthModule } from './auth/auth.module';
import { BookingsModule } from './bookings/bookings.module';
import { CategoriesModule } from './categories/categories.module';
import { DatabaseModule } from './database/database.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { RoomsModule } from './rooms/rooms.module';

@Module({
  imports: [
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: () => ({ stores: new KeyvCacheableMemory({ lruSize: 2000 }) }),
    }),
    DatabaseModule,
    AuthModule,
    CategoriesModule,
    RoomsModule,
    BookingsModule,
    DashboardModule,
  ],
})
export class AppModule {}
