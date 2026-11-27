import { Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import type { RegisterDto } from './auth.dto';
import type { AccessClaims, UserRow } from './auth.types';

const userColumns = 'u.id, u.email, u.full_name, u.phone, u.role, u.status, u.created_at';
const refreshLifetime = "interval '720 hours'";

async function insertSession(db: Pool | PoolClient, userId: string, tokenHash: string) {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     SELECT id, $2, now() + ${refreshLifetime} FROM users WHERE id = $1 AND status = 'active'
     RETURNING id`,
    [userId, tokenHash],
  );
  return rows.at(0)?.id;
}

@Injectable()
export class AuthRepository {
  constructor(private readonly database: DatabaseService) {}

  transaction<T>(run: (transaction: AuthTransaction) => Promise<T>): Promise<T> {
    return this.database.transaction((client) => run(new AuthTransaction(client)));
  }

  async findUserByEmail(email: string) {
    const { rows } = await this.database.pool.query<UserRow & { password_hash: string }>(
      `SELECT ${userColumns}, u.password_hash FROM users AS u WHERE lower(u.email) = $1`,
      [email],
    );
    return rows.at(0);
  }

  createSession(userId: string, tokenHash: string) {
    return insertSession(this.database.pool, userId, tokenHash);
  }

  async findSessionUser({ sub, sid }: AccessClaims) {
    const { rows } = await this.database.pool.query<UserRow>(
      `SELECT ${userColumns}
       FROM users AS u JOIN refresh_tokens AS rt ON rt.user_id = u.id
       WHERE u.id = $1 AND rt.id = $2 AND rt.revoked_at IS NULL AND rt.expires_at > now()`,
      [sub, sid],
    );
    return rows.at(0);
  }

  async revokeFamily(familyHash: string) {
    await this.database.pool.query(
      `UPDATE refresh_tokens SET revoked_at = now()
       WHERE revoked_at IS NULL AND split_part(token_hash, ':', 1) = $1`,
      [familyHash],
    );
  }

  async revokeSession(userId: string, sessionId: string, tokenHash: string | null) {
    await this.database.pool.query(
      `UPDATE refresh_tokens
       SET revoked_at = now()
       WHERE user_id = $1 AND revoked_at IS NULL
         AND (($3::text IS NULL AND id = $2) OR token_hash = $3)`,
      [userId, sessionId, tokenHash],
    );
  }
}

class AuthTransaction {
  constructor(private readonly client: PoolClient) {}

  async createUser(input: RegisterDto, passwordHash: string): Promise<UserRow> {
    const { rows } = await this.client.query<UserRow>(
      `INSERT INTO users AS u (email, password_hash, full_name, phone, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${userColumns}`,
      [input.email, passwordHash, input.fullName, input.phone ?? null, input.role],
    );
    return rows[0];
  }

  createSession(userId: string, tokenHash: string) {
    return insertSession(this.client, userId, tokenHash);
  }

  async rotateSession(oldHash: string, newHash: string) {
    const { rows } = await this.client.query<UserRow & { session_id: string }>(
      `WITH rotated AS (
         UPDATE refresh_tokens AS rt
         SET token_hash = $2, expires_at = now() + ${refreshLifetime}
         FROM users AS u
         WHERE rt.token_hash = $1 AND rt.revoked_at IS NULL AND rt.expires_at > now()
           AND u.id = rt.user_id AND u.status = 'active'
         RETURNING rt.id, rt.user_id
       )
       SELECT ${userColumns}, rotated.id AS session_id
       FROM rotated JOIN users AS u ON u.id = rotated.user_id`,
      [oldHash, newHash],
    );
    return rows.at(0);
  }
}
