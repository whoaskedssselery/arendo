import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { RoomsModule } from './rooms/rooms.module';

@Module({
  imports: [DatabaseModule, AuthModule, RoomsModule],
})
export class AppModule {}
