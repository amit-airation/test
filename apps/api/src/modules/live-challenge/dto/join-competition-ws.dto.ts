import { IsUUID } from 'class-validator';

export class JoinCompetitionWsDto {
  @IsUUID()
  competitionId!: string;
}
