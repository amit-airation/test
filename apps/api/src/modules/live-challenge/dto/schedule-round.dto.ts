import { IsISO8601 } from 'class-validator';

export class ScheduleRoundDto {
  @IsISO8601()
  scheduledStartAt!: string;
}
