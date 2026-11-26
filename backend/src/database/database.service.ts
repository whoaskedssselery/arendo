import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';
import { databaseConfig } from './database.config';

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseService.name);
  readonly pool = new Pool(databaseConfig());

  constructor() {
    this.pool.on('error', (error) => this.logger.error(error.message));
  }

  async checkConnection(): Promise<void> {
    await this.pool.query('SELECT 1 FROM room_categories LIMIT 1');
    this.logger.log('Connected to PostgreSQL');
  }

  async transaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    let discardClient = false;

    try {
      await client.query('BEGIN');
      const result = await run(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        discardClient = true;
      }
      throw error;
    } finally {
      client.release(discardClient);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
