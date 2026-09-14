import type { ConfigService } from '@nestjs/config';

/**
 * Rate-limit buckets. `competition` is deliberately generous because the
 * challenge is high-frequency by design: a participant may publish many jobs
 * inside a 5-minute window and must never be throttled for legitimate play.
 */
export const RATE_LIMIT_POLICIES = {
  DEFAULT: 'default',
  AUTH: 'auth',
  COMPETITION: 'competition',
} as const;

export type RateLimitPolicy =
  (typeof RATE_LIMIT_POLICIES)[keyof typeof RATE_LIMIT_POLICIES];

export const RATE_LIMIT_POLICY_KEY = 'rate_limit_policy';

type PolicyLimits = { ttl: number; limit: number };

const DEFAULTS: Record<RateLimitPolicy, PolicyLimits> = {
  [RATE_LIMIT_POLICIES.DEFAULT]: { ttl: 60_000, limit: 300 },
  [RATE_LIMIT_POLICIES.AUTH]: { ttl: 60_000, limit: 10 },
  [RATE_LIMIT_POLICIES.COMPETITION]: { ttl: 10_000, limit: 120 },
};

const ENV_PREFIX: Record<RateLimitPolicy, string> = {
  [RATE_LIMIT_POLICIES.DEFAULT]: 'THROTTLE_DEFAULT',
  [RATE_LIMIT_POLICIES.AUTH]: 'THROTTLE_AUTH',
  [RATE_LIMIT_POLICIES.COMPETITION]: 'THROTTLE_COMPETITION',
};

export function resolvePolicyLimits(
  config: ConfigService,
  policy: RateLimitPolicy,
): PolicyLimits {
  const prefix = ENV_PREFIX[policy];
  const fallback = DEFAULTS[policy];
  return {
    ttl: config.get<number>(`${prefix}_TTL_MS`, fallback.ttl),
    limit: config.get<number>(`${prefix}_LIMIT`, fallback.limit),
  };
}

export function resolveWsConnectionLimits(config: ConfigService): PolicyLimits {
  return {
    ttl: config.get<number>('THROTTLE_WS_CONNECT_TTL_MS', 60_000),
    limit: config.get<number>('THROTTLE_WS_CONNECT_LIMIT', 60),
  };
}
