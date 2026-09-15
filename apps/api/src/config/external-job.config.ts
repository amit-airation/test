import type { ConfigService } from '@nestjs/config';
import { EXTERNAL_JOB_WEBHOOK } from '../modules/live-challenge/constants.js';

function parseBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value.trim() === '') return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

/** When false, POST /api/integrations/job-events returns 503. Default: enabled. */
export function isExternalJobWebhookEnabled(config: ConfigService): boolean {
  return parseBool(config.get<string>(EXTERNAL_JOB_WEBHOOK.ENABLED_ENV), true);
}

export function resolveExternalJobWebhookSecret(
  config: ConfigService,
): string | undefined {
  const secret = config.get<string>(EXTERNAL_JOB_WEBHOOK.SECRET_ENV)?.trim();
  return secret || undefined;
}

export function resolveExternalJobWebhookSkewSeconds(
  config: ConfigService,
): number {
  const raw = config.get<string | number>(EXTERNAL_JOB_WEBHOOK.SKEW_ENV);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return EXTERNAL_JOB_WEBHOOK.DEFAULT_SKEW_SECONDS;
  }
  return parsed;
}
