import { Controller, Get, Header, Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { DatabaseService } from '../database/database.service';

/** Проверка живости для Docker и мониторинга. */
@Controller('health')
class HealthController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async check() {
    await this.db.pool.query('SELECT 1');
    return { status: 'ok' };
  }
}

@Module({ imports: [DatabaseModule], controllers: [HealthController] })
export class HealthModule {}
