import { IsEmail, IsString, MinLength } from 'class-validator';

export class ProvisionAdminDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(12)
  password!: string;

  @IsString()
  @MinLength(1)
  name!: string;
}
