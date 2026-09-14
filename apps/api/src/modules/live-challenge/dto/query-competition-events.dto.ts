import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { CompetitionEventType } from '../../../generated/prisma/client.js';

export class QueryCompetitionEventsDto {
  @IsOptional()
  @IsEnum(CompetitionEventType)
  eventType?: CompetitionEventType;

  @IsOptional()
  @IsUUID()
  participantId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
