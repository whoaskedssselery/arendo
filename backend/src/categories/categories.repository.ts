import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

interface CategoryRow {
  id: string;
  name: string;
  description: string | null;
  photo_url: string | null;
  base_price_per_hour: string;
}

@Injectable()
export class CategoriesRepository {
  constructor(private readonly database: DatabaseService) {}

  async list() {
    const { rows } = await this.database.pool.query<CategoryRow>(
      'SELECT id, name, description, photo_url, base_price_per_hour FROM room_categories ORDER BY id',
    );
    return rows;
  }
}
