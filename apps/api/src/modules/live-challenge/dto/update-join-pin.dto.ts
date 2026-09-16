import { IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateJoinPinDto {
  @IsString()
  @MinLength(4)
  @MaxLength(64)
  password!: string;
}
