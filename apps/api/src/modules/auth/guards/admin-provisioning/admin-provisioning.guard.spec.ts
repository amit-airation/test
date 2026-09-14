import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { UserRole } from '../../../../generated/prisma/client.js';
import {
  ADMIN_BOOTSTRAP_HEADER,
  AdminProvisioningGuard,
} from './admin-provisioning.guard.js';

const BOOTSTRAP_TOKEN = 'a'.repeat(40);

function contextWithHeaders(
  headers: Record<string, string>,
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

function build(options?: {
  bootstrapToken?: string;
  verifiedSub?: string;
  role?: UserRole;
  adminCount?: number;
}) {
  const config = {
    get: (key: string) =>
      key === 'ADMIN_BOOTSTRAP_TOKEN'
        ? options?.bootstrapToken
        : key === 'JWT_SECRET'
          ? 's'.repeat(40)
          : undefined,
  };
  const jwt = {
    verifyAsync: vi.fn(() =>
      options?.verifiedSub
        ? Promise.resolve({ sub: options.verifiedSub })
        : Promise.reject(new Error('invalid token')),
    ),
  };
  const authService = {
    validateUserById: vi.fn(() =>
      Promise.resolve(
        options?.verifiedSub
          ? {
              id: options.verifiedSub,
              role: options?.role ?? UserRole.EMPLOYER,
            }
          : null,
      ),
    ),
    countAdmins: vi.fn(() => Promise.resolve(options?.adminCount ?? 0)),
  };
  return new AdminProvisioningGuard(
    config as never,
    jwt as never,
    authService as never,
  );
}

describe('AdminProvisioningGuard', () => {
  it('denies anonymous callers when no bootstrap token is configured', async () => {
    const guard = build();
    await expect(guard.canActivate(contextWithHeaders({}))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('denies a bootstrap token when none is configured', async () => {
    const guard = build();
    await expect(
      guard.canActivate(
        contextWithHeaders({ [ADMIN_BOOTSTRAP_HEADER]: BOOTSTRAP_TOKEN }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('accepts the configured bootstrap token before any admin exists', async () => {
    const guard = build({ bootstrapToken: BOOTSTRAP_TOKEN, adminCount: 0 });
    await expect(
      guard.canActivate(
        contextWithHeaders({ [ADMIN_BOOTSTRAP_HEADER]: BOOTSTRAP_TOKEN }),
      ),
    ).resolves.toBe(true);
  });

  it('rejects the bootstrap token after the first admin exists', async () => {
    const guard = build({ bootstrapToken: BOOTSTRAP_TOKEN, adminCount: 1 });
    await expect(
      guard.canActivate(
        contextWithHeaders({ [ADMIN_BOOTSTRAP_HEADER]: BOOTSTRAP_TOKEN }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a wrong bootstrap token', async () => {
    const guard = build({ bootstrapToken: BOOTSTRAP_TOKEN });
    await expect(
      guard.canActivate(
        contextWithHeaders({ [ADMIN_BOOTSTRAP_HEADER]: 'b'.repeat(40) }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('accepts an existing admin session', async () => {
    const guard = build({ verifiedSub: 'admin-1', role: UserRole.ADMIN });
    await expect(
      guard.canActivate(contextWithHeaders({ authorization: 'Bearer token' })),
    ).resolves.toBe(true);
  });

  it('rejects an authenticated non-admin', async () => {
    const guard = build({ verifiedSub: 'employer-1', role: UserRole.EMPLOYER });
    await expect(
      guard.canActivate(contextWithHeaders({ authorization: 'Bearer token' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
