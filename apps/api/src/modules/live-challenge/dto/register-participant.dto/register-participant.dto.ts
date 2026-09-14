import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class RegisterParticipantDto {
  @IsUUID()
  userId!: string;

  @IsOptional()
  @IsUUID()
  companyId?: string;

  /** Job-server user id used to attribute external publishes. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  externalUserId?: string;
}
