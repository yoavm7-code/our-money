import { IsEmail, IsOptional, IsString, IsBoolean, MaxLength, Matches } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  @Matches(/^[A-Za-z]{2}$/, { message: 'Country must be a 2-letter ISO code' })
  countryCode?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsBoolean()
  isAdmin?: boolean;

  @IsOptional()
  @IsBoolean()
  emailVerified?: boolean;
}
