import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash, truncates } from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import type { LoginDto, RegisterDto } from './auth.dto';
import { AuthRepository } from './auth.repository';
import { type AccessClaims, type AuthenticatedSession, type UserRow, userResponse } from './auth.types';

const passwordCost = 12;
// Keep the amount of bcrypt work similar when the email does not exist.
const dummyPasswordHash = '$2b$12$tLm53TP7VSjqdhDNG2uAG.RrOoKLeSOTN02muGQNOMmkTO9E7AITS';

function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly repository: AuthRepository,
    private readonly jwt: JwtService,
  ) {}

  async register(input: RegisterDto) {
    if (truncates(input.password)) {
      throw new UnprocessableEntityException('Password must not exceed 72 UTF-8 bytes.');
    }

    const passwordHash = await hash(input.password, passwordCost);
    const refreshToken = randomBytes(32).toString('base64url');

    try {
      return await this.database.transaction(async (client) => {
        const user = await this.repository.createUser(client, input, passwordHash);
        const sessionId = await this.repository.createSession(user.id, hashRefreshToken(refreshToken), client);
        if (!sessionId) throw new ForbiddenException('Account is blocked.');
        return this.tokens(user, sessionId, refreshToken);
      });
    } catch (error) {
      if (error && typeof error === 'object' && 'constraint' in error && error.constraint === 'users_email_uq') {
        throw new ConflictException('An account with this email already exists.');
      }
      throw error;
    }
  }

  async login({ email, password }: LoginDto) {
    const user = await this.repository.findUserByEmail(email);
    const matches = !truncates(password) && (await compare(password, user?.password_hash ?? dummyPasswordHash));
    if (!matches || !user) throw new UnauthorizedException('Invalid email or password.');
    if (user.status === 'banned') throw new ForbiddenException('Account is blocked.');

    const refreshToken = randomBytes(32).toString('base64url');
    const sessionId = await this.repository.createSession(user.id, hashRefreshToken(refreshToken));
    if (!sessionId) throw new ForbiddenException('Account is blocked.');
    return this.tokens(user, sessionId, refreshToken);
  }

  async refresh(oldToken: string) {
    const refreshToken = randomBytes(32).toString('base64url');
    return this.database.transaction(async (client) => {
      const user = await this.repository.rotateSession(client, hashRefreshToken(oldToken), hashRefreshToken(refreshToken));
      if (!user) throw new UnauthorizedException('Invalid or expired refresh token.');
      return this.tokens(user, user.session_id, refreshToken);
    });
  }

  async authenticate(accessToken: string): Promise<AuthenticatedSession> {
    let claims: AccessClaims;
    try {
      claims = await this.jwt.verifyAsync<AccessClaims>(accessToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired access token.');
    }

    if (typeof claims.sub !== 'string' || typeof claims.sid !== 'string') {
      throw new UnauthorizedException('Invalid access token.');
    }
    const user = await this.repository.findSessionUser(claims);
    if (!user) throw new UnauthorizedException('Session is invalid or revoked.');
    if (user.status === 'banned') throw new ForbiddenException('Account is blocked.');
    return { id: claims.sid, user };
  }

  async logout(session: AuthenticatedSession, refreshToken?: string): Promise<void> {
    await this.repository.revokeSession(session.user.id, session.id, refreshToken ? hashRefreshToken(refreshToken) : null);
  }

  private tokens(user: UserRow, sessionId: string, refreshToken: string) {
    const claims: AccessClaims = { sub: user.id, sid: sessionId };
    return {
      accessToken: this.jwt.sign(claims, { jwtid: randomUUID() }),
      refreshToken,
      user: userResponse(user),
    };
  }
}
