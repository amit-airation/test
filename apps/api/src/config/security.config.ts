import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

const logger = new Logger('SecurityConfig');
const MIN_KEY_LENGTH = 32;
const WEAK_LIVEKIT_SECRETS = new Set(['secret', 'devkey', 'change-me']);

export function isProduction(config: ConfigService): boolean {
  return config.get<string>('NODE_ENV') === 'production';
}

/**
 * Validates required secrets at startup.
 * In production: throws if any key is missing or too short.
 * In development: warns but continues.
 */
export function assertSecureRuntimeConfig(config: ConfigService): void {
  const eventKey = config.get<string>('EVENT_ACCESS_KEY')?.trim();
  const adminKey = config.get<string>('ADMIN_KEY')?.trim();
  const webhookSecret = config
    .get<string>('EXTERNAL_JOB_WEBHOOK_SECRET')
    ?.trim();

  if (isProduction(config)) {
    if (!eventKey || eventKey.length < MIN_KEY_LENGTH) {
      throw new Error(
        `EVENT_ACCESS_KEY must be at least ${MIN_KEY_LENGTH} characters in production`,
      );
    }
    if (!adminKey || adminKey.length < MIN_KEY_LENGTH) {
      throw new Error(
        `ADMIN_KEY must be at least ${MIN_KEY_LENGTH} characters in production`,
      );
    }
    if (!webhookSecret || webhookSecret.length < MIN_KEY_LENGTH) {
      throw new Error(
        `EXTERNAL_JOB_WEBHOOK_SECRET must be at least ${MIN_KEY_LENGTH} characters in production`,
      );
    }

    const corsOrigin = config.get<string>('CORS_ORIGIN');
    if (!corsOrigin || corsOrigin === '*') {
      throw new Error('CORS_ORIGIN must name explicit origins in production');
    }

    const livekitUrl = config.get<string>('LIVEKIT_URL')?.trim();
    if (livekitUrl) {
      const livekitKey = config.get<string>('LIVEKIT_API_KEY')?.trim();
      const livekitSecret = config.get<string>('LIVEKIT_API_SECRET')?.trim();
      if (
        !livekitKey ||
        !livekitSecret ||
        WEAK_LIVEKIT_SECRETS.has(livekitKey) ||
        WEAK_LIVEKIT_SECRETS.has(livekitSecret) ||
        livekitSecret.length < MIN_KEY_LENGTH
      ) {
        throw new Error(
          'LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be strong unique values when LIVEKIT_URL is set in production',
        );
      }
    }
  } else {
    if (!eventKey) {
      logger.warn(
        'EVENT_ACCESS_KEY is not set — open access in effect (dev only)',
      );
    }
    if (!adminKey) {
      logger.warn('ADMIN_KEY is not set — admin routes unprotected (dev only)');
    }
  }
}
