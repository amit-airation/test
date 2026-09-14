import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolveWsConnectionLimits } from '../../../common/throttler/rate-limit.policies.js';

type Window = { count: number; expiresAt: number };

/**
 * Fixed-window limiter for socket handshakes, keyed by client address. Guards
 * against connection floods without touching in-competition event traffic,
 * which is intentionally high-frequency.
 */
@Injectable()
export class WsConnectionRateLimiterService implements OnModuleDestroy {
  private readonly logger = new Logger(WsConnectionRateLimiterService.name);
  private readonly windows = new Map<string, Window>();
  private readonly ttlMs: number;
  private readonly limit: number;
  private readonly sweeper: NodeJS.Timeout;

  constructor(config: ConfigService) {
    const limits = resolveWsConnectionLimits(config);
    this.ttlMs = limits.ttl;
    this.limit = limits.limit;
    this.sweeper = setInterval(() => this.sweep(), this.ttlMs).unref();
  }

  onModuleDestroy() {
    clearInterval(this.sweeper);
  }

  /** Returns false when the caller has exhausted its handshake budget. */
  consume(key: string): boolean {
    const now = Date.now();
    const existing = this.windows.get(key);

    if (!existing || existing.expiresAt <= now) {
      this.windows.set(key, { count: 1, expiresAt: now + this.ttlMs });
      return true;
    }

    existing.count += 1;
    if (existing.count > this.limit) {
      this.logger.warn({
        event: 'ws_connection_rate_limited',
        key,
        attempts: existing.count,
        limit: this.limit,
      });
      return false;
    }
    return true;
  }

  private sweep() {
    const now = Date.now();
    for (const [key, window] of this.windows) {
      if (window.expiresAt <= now) {
        this.windows.delete(key);
      }
    }
  }
}
