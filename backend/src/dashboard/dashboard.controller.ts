import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Query,
  Req,
  UsePipes,
} from "@nestjs/common";
import { RequireRoles } from "../auth/require-roles.decorator";
import type { AuthenticatedSession } from "../auth/auth.types";
import { ResourceIdDto } from "../http/resource-id.dto";
import { validationPipe } from "../http/validation.pipe";
import { PaginationDto, StatusDto } from "./dashboard.dto";
import { DashboardService } from "./dashboard.service";

@Controller()
@UsePipes(validationPipe("Invalid dashboard request."))
export class DashboardController {
  constructor(private readonly service: DashboardService) {}
  @Header("Cache-Control", "no-store")
  @Get("admin/users")
  @RequireRoles("admin")
  users(@Query() query: PaginationDto) {
    return this.service.users(query);
  }
  @Header("Cache-Control", "no-store")
  @Patch("admin/users/:id/status")
  @RequireRoles("admin")
  status(
    @Param() { id }: ResourceIdDto,
    @Req() req: { auth: AuthenticatedSession },
    @Body() body: StatusDto,
  ) {
    return this.service.status(id, req.auth.user, body);
  }
  @Header("Cache-Control", "no-store")
  @Get("tenants/:id")
  @RequireRoles("owner", "admin")
  tenant(
    @Param() { id }: ResourceIdDto,
    @Req() req: { auth: AuthenticatedSession },
  ) {
    return this.service.tenant(id, req.auth.user);
  }
}
