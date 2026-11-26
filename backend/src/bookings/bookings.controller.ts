import { Body, Controller, HttpCode, Param, Post, Req, UseGuards, UsePipes } from '@nestjs/common';
import { AccessTokenGuard } from '../auth/access-token.guard';
import type { AuthenticatedSession } from '../auth/auth.types';
import { RequireRoles } from '../auth/require-roles.decorator';
import { ResourceIdDto } from '../http/resource-id.dto';
import { validationPipe } from '../http/validation.pipe';
import { CancelBookingDto, CompleteBookingDto, CreateBookingDto } from './bookings.dto';
import { BookingsService } from './bookings.service';

@Controller('bookings')
@UsePipes(validationPipe('Invalid booking request.'))
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post()
  @RequireRoles('tenant')
  create(@Req() request: { auth: AuthenticatedSession }, @Body() input: CreateBookingDto) {
    return this.bookings.create(request.auth.user.id, input);
  }

  @Post(':id/cancel')
  @UseGuards(AccessTokenGuard)
  @HttpCode(200)
  cancel(@Param() { id }: ResourceIdDto, @Req() request: { auth: AuthenticatedSession }, @Body() input: CancelBookingDto) {
    return this.bookings.cancel(id, request.auth.user, input);
  }

  @Post(':id/complete')
  @RequireRoles('owner', 'admin')
  @HttpCode(200)
  complete(@Param() { id }: ResourceIdDto, @Req() request: { auth: AuthenticatedSession }, @Body() input: CompleteBookingDto) {
    return this.bookings.complete(id, request.auth.user, input);
  }
}
