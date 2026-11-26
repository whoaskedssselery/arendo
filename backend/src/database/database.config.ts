import type { ClientConfig } from 'pg';

export function databaseConfig(): ClientConfig {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('Set DATABASE_URL in the environment or in backend/.env.');
  }

  return { connectionString, connectionTimeoutMillis: 5000 };
}
