import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import {
  ThrottlerGuard,
  ThrottlerStorage,
  type ThrottlerModuleOptions,
} from '@nestjs/throttler';
import type { ExecutionContext } from '@nestjs/common';
import type { ThrottlerRequest } from '@nestjs/throttler';
import { resolveJwtSecret } from '../../config/security.config.js';
import {
  RATE_LIMIT_POLICIES,
  RATE_LIMIT_POLICY_KEY,
  type RateLimitPolicy,
} from './rate-limit.policies.js';

/**
 * Applies exactly one named throttler bucket per route (see `@RateLimit`) and
 * tracks authenticated callers by user id instead of IP, so participants
 * sharing a venue network never consume each other's budget.
 */
@Injectable()
export class ScopedThrottlerGuard extends ThrottlerGuard {
  constructor(
    options: ThrottlerModuleOptions,
    storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
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

  protected async getTracker(req: Record<string, any>): Promise<string> {
    const userId = this.extractUserId(req);
    if (userId) {
      return `user:${userId}`;
    }
    const ips = req.ips as string[] | undefined;
    return `ip:${ips?.length ? ips[0] : (req.ip as string)}`;
  }

  private resolvePolicy(context: ExecutionContext): RateLimitPolicy {
    return (
      this.reflector.getAllAndOverride<RateLimitPolicy>(
        RATE_LIMIT_POLICY_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? RATE_LIMIT_POLICIES.DEFAULT
    );
  }

  /**
   * Verifies the bearer token rather than trusting its payload: an unverified
   * `sub` could be rotated to mint fresh rate-limit buckets.
   */
  private extractUserId(req: Record<string, any>): string | null {
    const header = req.headers?.authorization as string | undefined;
    if (!header?.startsWith('Bearer ')) {
      return null;
    }
    try {
      const payload = this.jwt.verify<{ sub?: string }>(header.slice(7), {
        secret: resolveJwtSecret(this.config),
      });
      return payload.sub ?? null;
    } catch {
      return null;
    }
  }
}
