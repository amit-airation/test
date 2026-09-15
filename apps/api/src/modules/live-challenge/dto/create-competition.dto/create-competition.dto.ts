import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateCompetitionDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;
}
