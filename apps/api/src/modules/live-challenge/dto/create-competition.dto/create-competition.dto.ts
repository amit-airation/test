import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { DEFAULT_COMPETITION_DURATION_SECONDS } from '../../constants.js';

export class CreateCompetitionDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(3600)
  durationSeconds?: number = DEFAULT_COMPETITION_DURATION_SECONDS;

  /**
   * Opt-in to self-service join. Left off, only participants an admin
   * registered may join — see CompetitionService.join.
   */
  @IsOptional()
  @IsBoolean()
  allowOpenJoin?: boolean;
}
