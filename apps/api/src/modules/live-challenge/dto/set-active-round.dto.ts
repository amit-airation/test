import { IsOptional, IsUUID } from 'class-validator';

export class SetActiveRoundDto {
  @IsOptional()
  @IsUUID()
  roundId?: string | null;
}
