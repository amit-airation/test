import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

const DEV_JWT_SECRET = 'dev-only-insecure-secret';
const WEAK_SECRETS = new Set(['change-me', DEV_JWT_SECRET, 'secret']);
const MIN_SECRET_LENGTH = 32;

const logger = new Logger('SecurityConfig');

export function isProduction(config: ConfigService): boolean {
  return config.get<string>('NODE_ENV') === 'production';
}

/**
 * Single source of truth for the signing secret. Production refuses to boot on
 * a missing or well-known secret; development falls back with a loud warning.
 */
export function resolveJwtSecret(config: ConfigService): string {
  const secret = config.get<string>('JWT_SECRET')?.trim();
  const weak =
    !secret || WEAK_SECRETS.has(secret) || secret.length < MIN_SECRET_LENGTH;

  if (!weak) {
    return secret;
  }

  if (isProduction(config)) {
    throw new Error(
      `JWT_SECRET must be set to a unique value of at least ${MIN_SECRET_LENGTH} characters in production`,
    );
  }

  logger.warn({
    event: 'insecure_jwt_secret',
    message: `JWT_SECRET is missing or weak; using a development-only secret. Set a ${MIN_SECRET_LENGTH}+ character JWT_SECRET before deploying.`,
  });
  return secret ?? DEV_JWT_SECRET;
}

/**
 * Fails fast on configuration that would silently weaken the deployment.
 */
export function assertSecureRuntimeConfig(config: ConfigService): void {
  resolveJwtSecret(config);

  if (!isProduction(config)) {
    return;
  }

  const corsOrigin = config.get<string>('CORS_ORIGIN');
  if (!corsOrigin || corsOrigin === '*') {
    throw new Error('CORS_ORIGIN must name explicit origins in production');
  }

  const bootstrapToken = config.get<string>('ADMIN_BOOTSTRAP_TOKEN')?.trim();
  if (bootstrapToken && bootstrapToken.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `ADMIN_BOOTSTRAP_TOKEN must be at least ${MIN_SECRET_LENGTH} characters when set`,
    );
  }

  const webhookSecret = config
    .get<string>('EXTERNAL_JOB_WEBHOOK_SECRET')
    ?.trim();
  if (!webhookSecret || webhookSecret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `EXTERNAL_JOB_WEBHOOK_SECRET must be set to a unique value of at least ${MIN_SECRET_LENGTH} characters in production`,
    );
  }

  const livekitUrl = config.get<string>('LIVEKIT_URL')?.trim();
  if (livekitUrl) {
    const livekitKey = config.get<string>('LIVEKIT_API_KEY')?.trim();
    const livekitSecret = config.get<string>('LIVEKIT_API_SECRET')?.trim();
    if (
      !livekitKey ||
      !livekitSecret ||
      WEAK_SECRETS.has(livekitKey) ||
      WEAK_SECRETS.has(livekitSecret) ||
      livekitSecret.length < MIN_SECRET_LENGTH
    ) {
      throw new Error(
        'LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be strong unique values when LIVEKIT_URL is set in production',
      );
    }
  }
}
