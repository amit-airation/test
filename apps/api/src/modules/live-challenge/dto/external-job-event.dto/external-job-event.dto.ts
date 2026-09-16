import { Type } from 'class-transformer';
import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { EXTERNAL_JOB_EVENTS } from '../../constants.js';

export class ExternalJobPayloadDto {
  @IsString()
  @MinLength(3)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  employment_type?: string;
}

export class ExternalJobEventDto {
  @IsUUID()
  event_id!: string;

  @IsIn([EXTERNAL_JOB_EVENTS.PUBLISHED, EXTERNAL_JOB_EVENTS.UNPUBLISHED])
  event!: (typeof EXTERNAL_JOB_EVENTS)[keyof typeof EXTERNAL_JOB_EVENTS];

  /** The main server's company UUID — used to look up the round participant. */
  @IsString()
  @MinLength(1)
  company_id!: string;

  /** Optional display name refresh from the main server (never used for matching). */
  @IsOptional()
  @IsString()
  @MinLength(1)
  company_name?: string;

  @IsString()
  @MinLength(1)
  external_job_id!: string;

  @IsOptional()
  @IsISO8601()
  published_at?: string;

  @ValidateIf(
    (dto: ExternalJobEventDto) => dto.event === EXTERNAL_JOB_EVENTS.PUBLISHED,
  )
  @ValidateNested()
  @Type(() => ExternalJobPayloadDto)
  job?: ExternalJobPayloadDto;
}
