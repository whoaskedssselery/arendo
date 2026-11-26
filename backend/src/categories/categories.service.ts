import { Injectable } from '@nestjs/common';
import { PublicCache } from '../cache/public-cache.service';
import { CategoriesRepository } from './categories.repository';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly repository: CategoriesRepository,
    private readonly cache: PublicCache,
  ) {}

  list() {
    return this.cache.read('categories', [], async () => {
      const rows = await this.repository.list();
      return rows.map((category) => ({
        id: Number(category.id),
        name: category.name,
        ...(category.description !== null && { description: category.description }),
        ...(category.photo_url !== null && { photoUrl: category.photo_url }),
        basePricePerHour: Number(category.base_price_per_hour),
      }));
    });
  }
}
