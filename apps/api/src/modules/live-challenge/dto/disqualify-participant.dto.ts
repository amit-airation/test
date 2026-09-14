import { IsString, MaxLength, MinLength } from 'class-validator';

export class DisqualifyParticipantDto {
  /** Recorded in the audit trail so the sanction can be reviewed later. */
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;
}
