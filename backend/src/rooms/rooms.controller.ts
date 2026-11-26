import { Body, Controller, Get, Param, Patch, Post, Query, Req, UsePipes } from '@nestjs/common';
import type { AuthenticatedSession } from '../auth/auth.types';
import { RequireRoles } from '../auth/require-roles.decorator';
import { PublicCacheHeaders } from '../http/public-cache-headers.decorator';
import { ResourceIdDto } from '../http/resource-id.dto';
import { validationPipe } from '../http/validation.pipe';
import { CreateRoomDto, RoomPeriodDto, RoomQueryDto, UpdateRoomDto } from './rooms.dto';
import { RoomsService } from './rooms.service';

@Controller('rooms')
@UsePipes(validationPipe('Invalid room request.'))
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Get()
  @PublicCacheHeaders()
  list(@Query() query: RoomQueryDto) {
    return this.rooms.list(query);
  }

  @Get(':id')
  @PublicCacheHeaders()
  find(@Param() { id }: ResourceIdDto) {
    return this.rooms.find(id);
  }

  @Get(':id/calendar')
  @PublicCacheHeaders()
  calendar(@Param() { id }: ResourceIdDto, @Query() query: RoomPeriodDto) {
    return this.rooms.calendar(id, query);
  }

  @Post()
  @RequireRoles('owner')
  create(@Req() request: { auth: AuthenticatedSession }, @Body() room: CreateRoomDto) {
    return this.rooms.create(request.auth.user.id, room);
  }

  @Patch(':id')
  @RequireRoles('owner')
  update(@Param() { id }: ResourceIdDto, @Req() request: { auth: AuthenticatedSession }, @Body() room: UpdateRoomDto) {
    return this.rooms.update(id, request.auth.user.id, room);
  }
}
