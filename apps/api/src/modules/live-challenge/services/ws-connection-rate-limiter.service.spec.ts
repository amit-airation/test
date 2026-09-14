import { WsConnectionRateLimiterService } from './ws-connection-rate-limiter.service.js';

function build(limit: number, ttl: number) {
  const config = {
    get: (key: string, fallback: number) =>
      key === 'THROTTLE_WS_CONNECT_LIMIT'
        ? limit
        : key === 'THROTTLE_WS_CONNECT_TTL_MS'
          ? ttl
          : fallback,
  };
  return new WsConnectionRateLimiterService(config as never);
}

describe('WsConnectionRateLimiterService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows handshakes up to the configured limit', () => {
    const limiter = build(3, 60_000);
    expect([
      limiter.consume('1.2.3.4'),
      limiter.consume('1.2.3.4'),
      limiter.consume('1.2.3.4'),
    ]).toEqual([true, true, true]);
    expect(limiter.consume('1.2.3.4')).toBe(false);
  });

  it('keeps budgets independent per client', () => {
    const limiter = build(1, 60_000);
    expect(limiter.consume('1.2.3.4')).toBe(true);
    expect(limiter.consume('1.2.3.4')).toBe(false);
    expect(limiter.consume('5.6.7.8')).toBe(true);
  });

  it('restores the budget after the window elapses', () => {
    vi.useFakeTimers();
    const limiter = build(1, 1_000);

    expect(limiter.consume('1.2.3.4')).toBe(true);
    expect(limiter.consume('1.2.3.4')).toBe(false);

    vi.advanceTimersByTime(1_001);
    expect(limiter.consume('1.2.3.4')).toBe(true);

    limiter.onModuleDestroy();
  });
});
