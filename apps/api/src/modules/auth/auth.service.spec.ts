import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { UserRole } from '../../generated/prisma/client.js';
import { AuthService } from './auth.service.js';

type PrismaStub = {
  user: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
};

function build() {
  const prisma: PrismaStub = {
    user: { findUnique: vi.fn(), create: vi.fn() },
  };
  const jwt = { sign: vi.fn(() => 'signed-token') };
  const service = new AuthService(prisma as never, jwt as never);
  return { service, prisma, jwt };
}

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    email: 'a@example.com',
    name: 'A',
    role: UserRole.EMPLOYER,
    passwordHash: 'hash',
    ...overrides,
  };
}

describe('AuthService', () => {
  it('ignores any caller-supplied role and registers an employer', async () => {
    const { service, prisma } = build();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(({ data }: any) =>
      Promise.resolve(userRow({ role: data.role })),
    );

    const result = await service.register({
      email: 'a@example.com',
      password: 'password123',
      name: 'A',
      role: UserRole.ADMIN,
    } as never);

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: UserRole.EMPLOYER }),
      }),
    );
    expect(result.user.role).toBe(UserRole.EMPLOYER);
  });

  it('provisions admins only through the dedicated entry point', async () => {
    const { service, prisma } = build();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(({ data }: any) =>
      Promise.resolve(userRow({ role: data.role })),
    );

    const result = await service.provisionAdmin({
      email: 'admin@example.com',
      password: 'a-long-admin-password',
      name: 'Admin',
    });

    expect(result.user.role).toBe(UserRole.ADMIN);
  });

  it('rejects duplicate emails', async () => {
    const { service, prisma } = build();
    prisma.user.findUnique.mockResolvedValue(userRow());

    await expect(
      service.register({
        email: 'a@example.com',
        password: 'password123',
        name: 'A',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not distinguish unknown users from bad passwords', async () => {
    const { service, prisma } = build();
    prisma.user.findUnique.mockResolvedValue(null);
    const unknown = await service
      .login({ email: 'nobody@example.com', password: 'password123' })
      .catch((error: unknown) => error);

    prisma.user.findUnique.mockResolvedValue(
      userRow({ passwordHash: await bcrypt.hash('correct-password', 4) }),
    );
    const wrongPassword = await service
      .login({ email: 'a@example.com', password: 'password123' })
      .catch((error: unknown) => error);

    expect(unknown).toBeInstanceOf(UnauthorizedException);
    expect(wrongPassword).toBeInstanceOf(UnauthorizedException);
    expect((unknown as Error).message).toBe((wrongPassword as Error).message);
  });

  it('issues a token for valid credentials', async () => {
    const { service, prisma, jwt } = build();
    prisma.user.findUnique.mockResolvedValue(
      userRow({ passwordHash: await bcrypt.hash('correct-password', 4) }),
    );

    const result = await service.login({
      email: 'a@example.com',
      password: 'correct-password',
    });

    expect(jwt.sign).toHaveBeenCalledWith({
      sub: 'user-1',
      email: 'a@example.com',
      role: UserRole.EMPLOYER,
    });
    expect(result.access_token).toBe('signed-token');
  });
});
