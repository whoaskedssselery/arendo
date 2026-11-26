import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';

const ttlMs = {
  categories: 3_600_000,
  catalog: 45_000,
  availability: 45_000,
  room: 180_000,
  calendar: 15_000,
};

type CacheGroup = keyof typeof ttlMs;
type CacheKeyPart = string | number | undefined;

@Injectable()
export class PublicCache {
  private readonly logger = new Logger(PublicCache.name);
  private readonly versions: Record<CacheGroup, number> = {
    categories: 0,
    catalog: 0,
    availability: 0,
    room: 0,
    calendar: 0,
  };

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  async read<T>(group: CacheGroup, parts: readonly CacheKeyPart[], load: () => Promise<T>): Promise<T> {
    const hash = createHash('sha256').update(JSON.stringify(parts)).digest('hex');
    for (;;) {
      const version = this.versions[group];
      const key = `public:${group}:${version}:${hash}`;
      const cached = await this.cache.get<T>(key);
      if (version !== this.versions[group]) continue;
      if (cached !== undefined) {
        this.logger.log(`HIT ${group}`);
        return cached;
      }

      const value = await this.cache.wrap(key, async () => {
        this.logger.log(`MISS ${group}`);
        return load();
      }, ttlMs[group]);

      // A read started before a commit can only fill its previous generation.
      if (version === this.versions[group]) return value;
    }
  }

  invalidate(...groups: CacheGroup[]): void {
    for (const group of groups) this.versions[group]++;
  }
}
