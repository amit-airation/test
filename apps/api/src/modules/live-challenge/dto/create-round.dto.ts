import { IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { DEFAULT_ROUND_DURATION_SECONDS } from '../constants.js';

export class CreateRoundDto {
  @IsInt()
  @Min(1)
  roundNumber!: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(3600)
  durationSeconds?: number = DEFAULT_ROUND_DURATION_SECONDS;
}
