import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { BookingsRepository } from './bookings.repository';

@Injectable()
export class BookingStatusScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(BookingStatusScheduler.name);
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;

  constructor(private readonly repository: BookingsRepository) {}

  onApplicationBootstrap(): void {
    this.run();
    this.timer = setInterval(() => this.run(), 60_000).unref();
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.timer);
    await this.running;
  }

  private run(): void {
    this.running ??= this.synchronize().finally(() => {
      this.running = undefined;
    });
  }

  private async synchronize(): Promise<void> {
    try {
      const updated = await this.repository.syncStatuses();
      if (updated > 0) this.logger.log(`Activated ${updated} booking(s)`);
    } catch (error) {
      this.logger.error('Could not synchronize booking statuses.', error instanceof Error ? error.stack : error);
    }
  }
}
