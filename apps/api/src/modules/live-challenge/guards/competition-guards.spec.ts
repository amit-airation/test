import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminKeyGuard } from './admin-key/admin-key.guard.js';
import { EventKeyGuard } from './event-key/event-key.guard.js';

function contextFor(headers: Record<string, string | undefined>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as unknown as ExecutionContext;
}

describe('AdminKeyGuard', () => {
  const config = {
    get: (key: string, def = '') =>
      key === 'ADMIN_KEY' ? 'secret_admin_key' : def,
  } as ConfigService;
  const guard = new AdminKeyGuard(config);

  it('allows request with matching x-admin-key header', () => {
    expect(
      guard.canActivate(contextFor({ 'x-admin-key': 'secret_admin_key' })),
    ).toBe(true);
  });

  it('rejects request with wrong x-admin-key header', () => {
    expect(() =>
      guard.canActivate(contextFor({ 'x-admin-key': 'wrong_key' })),
    ).toThrow(UnauthorizedException);
  });

  it('rejects request with missing x-admin-key header', () => {
    expect(() => guard.canActivate(contextFor({}))).toThrow(
      UnauthorizedException,
    );
  });
});

describe('EventKeyGuard', () => {
  const config = {
    get: (key: string, def = '') =>
      key === 'EVENT_ACCESS_KEY' ? 'secret_event_key' : def,
  } as ConfigService;
  const guard = new EventKeyGuard(config);

  it('allows request with matching x-event-key header', () => {
    expect(
      guard.canActivate(contextFor({ 'x-event-key': 'secret_event_key' })),
    ).toBe(true);
  });

  it('rejects request with wrong x-event-key header', () => {
    expect(() =>
      guard.canActivate(contextFor({ 'x-event-key': 'wrong_key' })),
    ).toThrow(UnauthorizedException);
  });

  it('rejects request with missing x-event-key header', () => {
    expect(() => guard.canActivate(contextFor({}))).toThrow(
      UnauthorizedException,
    );
  });
});
