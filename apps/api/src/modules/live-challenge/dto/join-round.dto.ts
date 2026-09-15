import { IsString, MinLength } from 'class-validator';

export class JoinRoundDto {
  @IsString()
  @MinLength(1)
  companyId!: string;

  @IsString()
  @MinLength(1)
  companyName!: string;

  @IsString()
  @MinLength(1)
  displayName!: string;
}
