import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsNotEmpty, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { publicRoles } from './auth.types';

const formattedPhone = /^\+?[0-9] \([0-9]{3}\) [0-9]{3}-[0-9]{2}-[0-9]{2}$/;

class EmailDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail()
  @Matches(/^[^@\s\u0000]+@[^@\s\u0000]+\.[^@\s\u0000]+$/u)
  @MaxLength(255)
  email!: string;
}

export class LoginDto extends EmailDto {
  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class RegisterDto extends EmailDto {
  @IsString()
  @MinLength(8)
  password!: string;

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @IsNotEmpty()
  @Matches(/^[^\u0000]+$/u)
  @MaxLength(150)
  fullName!: string;

  // Принимаются цифры, цифры с «+» и запись «+7 (999) 123-45-67»; в базу идут только цифры и «+».
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return formattedPhone.test(trimmed) ? trimmed.replace(/[ ()-]/g, '') : trimmed;
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Matches(/^\+?[0-9]{10,15}$/)
  phone?: string;

  @IsIn(publicRoles)
  role!: (typeof publicRoles)[number];
}

export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

export class LogoutDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  refreshToken?: string;
}
