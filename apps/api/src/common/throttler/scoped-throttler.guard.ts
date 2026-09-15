import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ThrottlerGuard,
  ThrottlerStorage,
  type ThrottlerModuleOptions,
} from '@nestjs/throttler';
import type { ExecutionContext } from '@nestjs/common';
import type { ThrottlerRequest } from '@nestjs/throttler';
import {
  RATE_LIMIT_POLICIES,
  RATE_LIMIT_POLICY_KEY,
  type RateLimitPolicy,
} from './rate-limit.policies.js';

/**
 * Applies exactly one named throttler bucket per route (see @RateLimit).
 * Tracks by IP — no JWT dependency since auth is now key-based.
 */
@Injectable()
export class ScopedThrottlerGuard extends ThrottlerGuard {
  constructor(
    options: ThrottlerModuleOptions,
    storageService: ThrottlerStorage,
    reflector: Reflector,
  ) {
    super(options, storageService, reflector);
  }

  protected async handleRequest(
    requestProps: ThrottlerRequest,
  ): Promise<boolean> {
    const policy = this.resolvePolicy(requestProps.context);
    if (requestProps.throttler.name !== policy) {
      return true;
    }
    return super.handleRequest(requestProps);
  }

  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const ips = req.ips as string[] | undefined;
    return `ip:${ips?.length ? ips[0] : (req.ip as string)}`;
  }

  private resolvePolicy(context: ExecutionContext): RateLimitPolicy {
    return (
      this.reflector.getAllAndOverride<RateLimitPolicy>(RATE_LIMIT_POLICY_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? RATE_LIMIT_POLICIES.DEFAULT
    );
  }
}
