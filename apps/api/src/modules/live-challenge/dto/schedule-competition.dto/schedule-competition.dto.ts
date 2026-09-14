import { IsDateString } from 'class-validator';

export class ScheduleCompetitionDto {
  @IsDateString()
  scheduledStartAt!: string;
}
