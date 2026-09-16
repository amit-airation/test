import { IsOptional, IsString, IsUUID } from 'class-validator';

export class JoinCompetitionWsDto {
  @IsUUID()
  competitionId!: string;

  /** Company id — identifies this socket as a participant (omit for observer). */
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  companyName?: string;
}

export class JoinRoundWsDto {
  @IsUUID()
  competitionId!: string;

  @IsUUID()
  roundId!: string;

  /** Participant's company id. Required to claim a presence session. */
  @IsOptional()
  @IsString()
  companyId?: string;
}
