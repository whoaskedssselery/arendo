import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Post,
  Req,
  UnprocessableEntityException,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AccessTokenGuard } from './access-token.guard';
import { LoginDto, LogoutDto, RefreshDto, RegisterDto } from './auth.dto';
import { AuthService } from './auth.service';
import { type AuthenticatedSession, userResponse } from './auth.types';

@Controller('auth')
@UsePipes(new ValidationPipe({
  transform: true,
  whitelist: true,
  exceptionFactory: (validationErrors) => new UnprocessableEntityException({
    statusCode: 422,
    message: 'Invalid request body.',
    errors: validationErrors.map(({ property, constraints }) => ({
      field: property,
      message: Object.values(constraints ?? {}).join(', '),
    })),
  }),
}))
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @Header('Cache-Control', 'no-store')
  register(@Body() input: RegisterDto) {
    return this.auth.register(input);
  }

  @Post('login')
  @UseGuards(ThrottlerGuard)
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  login(@Body() input: LoginDto) {
    return this.auth.login(input);
  }

  @Post('refresh')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  refresh(@Body() input: RefreshDto) {
    return this.auth.refresh(input.refreshToken);
  }

  @Post('logout')
  @UseGuards(AccessTokenGuard)
  @HttpCode(204)
  logout(@Req() request: { auth: AuthenticatedSession }, @Body() input: LogoutDto) {
    return this.auth.logout(request.auth, input.refreshToken);
  }

  @Get('me')
  @UseGuards(AccessTokenGuard)
  @Header('Cache-Control', 'no-store')
  me(@Req() request: { auth: AuthenticatedSession }) {
    return userResponse(request.auth.user);
  }
}
