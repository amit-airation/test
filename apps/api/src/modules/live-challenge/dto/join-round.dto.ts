import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class JoinRoundDto {
  @IsString()
  @MinLength(10)
  @MaxLength(20)
  @Matches(/^[\d\s+\-()]+$/, {
    message: 'mobile must contain digits',
  })
  mobile!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(64)
  password!: string;
}
