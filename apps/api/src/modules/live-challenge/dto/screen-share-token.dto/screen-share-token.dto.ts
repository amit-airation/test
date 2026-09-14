import { IsIn } from 'class-validator';

export const SCREEN_SHARE_INTENTS = ['publish', 'watch'] as const;
export type ScreenShareIntent = (typeof SCREEN_SHARE_INTENTS)[number];

export class ScreenShareTokenDto {
  @IsIn(SCREEN_SHARE_INTENTS)
  intent!: ScreenShareIntent;
}
