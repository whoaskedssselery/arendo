import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { databaseConfig } from './database.config';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  readonly pool = new Pool(databaseConfig());

  constructor() {
    this.pool.on('error', (error) => this.logger.error(error.message));
  }

  async checkConnection(): Promise<void> {
    await this.pool.query('SELECT 1 FROM room_categories LIMIT 1');
    this.logger.log('Connected to PostgreSQL');
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
