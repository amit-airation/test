import { SetMetadata } from '@nestjs/common';
import {
  RATE_LIMIT_POLICY_KEY,
  type RateLimitPolicy,
} from './rate-limit.policies.js';

/**
 * Selects which throttler bucket applies to a controller or handler.
 * Handlers without the decorator fall back to the `default` bucket.
 */
export const RateLimit = (policy: RateLimitPolicy) =>
  SetMetadata(RATE_LIMIT_POLICY_KEY, policy);
