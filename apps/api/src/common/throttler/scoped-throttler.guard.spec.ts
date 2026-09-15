import { Reflector } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { ExecutionContext } from '@nestjs/common';
import { RATE_LIMIT_POLICIES } from './rate-limit.policies.js';
import { ScopedThrottlerGuard } from './scoped-throttler.guard.js';

class TestGuard extends ScopedThrottlerGuard {
  callHandleRequest(request: unknown) {
    return this.handleRequest(request as never);
  }

  callGetTracker(req: Record<string, unknown>) {
    return this.getTracker(req);
  }
}

function build(options?: { policy?: string }) {
  const reflector = new Reflector();
  vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(
    options?.policy as never,
  );
  return new TestGuard(
    { throttlers: [] } as never,
    {} as never,
    reflector,
  );
}

const context = {
  getHandler: () => () => undefined,
  getClass: () => class {},
} as unknown as ExecutionContext;

describe('ScopedThrottlerGuard policy selection', () => {
  let enforced: string[];

  beforeEach(() => {
    enforced = [];
    vi.spyOn(
      ThrottlerGuard.prototype as unknown as {
        handleRequest: (request: { throttler: { name: string } }) => unknown;
      },
      'handleRequest',
    ).mockImplementation(async (request) => {
      enforced.push(request.throttler.name);
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function runAllBuckets(guard: TestGuard) {
    for (const name of Object.values(RATE_LIMIT_POLICIES)) {
      await guard.callHandleRequest({ context, throttler: { name } });
    }
  }

  it('applies only the default bucket to undecorated routes', async () => {
    await runAllBuckets(build());
    expect(enforced).toEqual([RATE_LIMIT_POLICIES.DEFAULT]);
  });

  it('applies only the declared bucket to decorated routes', async () => {
    await runAllBuckets(build({ policy: RATE_LIMIT_POLICIES.COMPETITION }));
    expect(enforced).toEqual([RATE_LIMIT_POLICIES.COMPETITION]);
  });

  it('applies the strict auth bucket where declared', async () => {
    await runAllBuckets(build({ policy: RATE_LIMIT_POLICIES.AUTH }));
    expect(enforced).toEqual([RATE_LIMIT_POLICIES.AUTH]);
  });
});

describe('ScopedThrottlerGuard tracker', () => {
  it('falls back to the client address', async () => {
    const guard = build();

    await expect(
      guard.callGetTracker({ headers: {}, ip: '10.0.0.1' }),
    ).resolves.toBe('ip:10.0.0.1');
  });
});
