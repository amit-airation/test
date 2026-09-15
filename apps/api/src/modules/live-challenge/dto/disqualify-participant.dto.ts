import { IsString, MaxLength, MinLength } from 'class-validator';

export class DisqualifyParticipantDto {
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;
}
