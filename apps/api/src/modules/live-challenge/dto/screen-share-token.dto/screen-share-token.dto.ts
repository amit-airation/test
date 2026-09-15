import { IsIn, IsOptional, IsString } from 'class-validator';

export type ScreenShareIntent = 'publish' | 'watch';

export class ScreenShareTokenDto {
  @IsIn(['publish', 'watch'])
  intent!: ScreenShareIntent;

  /** The requesting company's id — required for publish, optional for watch. */
  @IsOptional()
  @IsString()
  companyId?: string;

  /** Display name shown in the screen share stage. */
  @IsOptional()
  @IsString()
  displayName?: string;
}
