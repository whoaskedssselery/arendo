import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { DatabaseModule } from '../database/database.module';
import { AccessTokenGuard } from './access-token.guard';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { RolesGuard } from './roles.guard';

@Module({
  imports: [
    DatabaseModule,
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = process.env.JWT_ACCESS_SECRET;
        if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
          throw new Error('Set JWT_ACCESS_SECRET to a random secret of at least 32 bytes.');
        }
        return {
          secret,
          signOptions: { algorithm: 'HS256', expiresIn: 15 * 60 },
          verifyOptions: { algorithms: ['HS256'] },
        };
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 5 }]),
  ],
  controllers: [AuthController],
  providers: [AuthRepository, AuthService, AccessTokenGuard, RolesGuard],
  exports: [AuthService, AccessTokenGuard, RolesGuard],
})
export class AuthModule {}
