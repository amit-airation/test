import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class JoinCompetitionDto {
  /** Optional company override; otherwise resolved from CompanyMembership. */
  @IsOptional()
  @IsUUID()
  companyId?: string;

  /** Job-server user id used to attribute external publishes. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  externalUserId?: string;
}
