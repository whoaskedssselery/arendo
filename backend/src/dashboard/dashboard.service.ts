import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { type UserRow, userResponse } from "../auth/auth.types";
import { DashboardRepository } from "./dashboard.repository";
import type { PaginationDto, StatusDto } from "./dashboard.dto";

@Injectable()
export class DashboardService {
  constructor(private readonly repo: DashboardRepository) {}
  async users(query: PaginationDto) {
    return (await this.repo.users(query)).map(userResponse);
  }
  async status(id: number, actor: UserRow, input: StatusDto) {
    if (String(id) === actor.id)
      throw new ForbiddenException("Cannot change your own status.");
    const row = await this.repo.status(id, input.status, actor.id);
    if (!row) throw new NotFoundException("User not found.");
    return userResponse(row);
  }
  async tenant(id: number, actor: UserRow) {
    const card = await this.repo.tenant(id, actor);
    if (!card) throw new NotFoundException("Tenant not found.");
    return { ...card, tenantId: Number(card.tenantId) };
  }
}
