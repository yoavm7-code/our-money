import { IsEmail, IsOptional, IsString, MinLength, IsBoolean, MaxLength, Matches } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  @Matches(/^[A-Za-z]{2}$/, { message: 'Country must be a 2-letter ISO code' })
  countryCode?: string;

  @IsOptional()
  @IsBoolean()
  isAdmin?: boolean;
}
