import { Controller, Get } from '@nestjs/common';
import { PublicCacheHeaders } from '../http/public-cache-headers.decorator';
import { CategoriesService } from './categories.service';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @PublicCacheHeaders()
  list() {
    return this.categories.list();
  }
}
