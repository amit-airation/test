import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class RoundParticipantEntryDto {
  @IsString()
  @MinLength(1)
  companyId!: string;

  @IsString()
  @MinLength(1)
  companyName!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(20)
  @Matches(/^[\d\s+\-()]+$/, {
    message: 'mobile must contain digits',
  })
  mobile!: string;
}

export class RegisterRoundParticipantsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RoundParticipantEntryDto)
  participants!: RoundParticipantEntryDto[];
}
