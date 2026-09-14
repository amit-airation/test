import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { UserRole } from '../../../generated/prisma/client.js';
import { CompetitionAdminGuard } from './competition-admin/competition-admin.guard.js';
import { CompetitionObserverGuard } from './competition-observer/competition-observer.guard.js';
import { CompetitionParticipantGuard } from './competition-participant/competition-participant.guard.js';

const COMPETITION_ID = '11111111-1111-1111-1111-111111111111';

type RequestShape = {
  user?: { id: string; role: UserRole };
  params: { id: string };
  competitionParticipant?: unknown;
};

function contextFor(request: RequestShape): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function prismaStub(options: {
  competitionExists?: boolean;
  participant?: Record<string, unknown> | null;
}) {
  return {
    competition: {
      findUnique: vi.fn(() =>
        Promise.resolve(
          options.competitionExists === false ? null : { id: COMPETITION_ID },
        ),
      ),
    },
    competitionParticipant: {
      findUnique: vi.fn(() => Promise.resolve(options.participant ?? null)),
    },
  };
}

describe('CompetitionAdminGuard', () => {
  const guard = new CompetitionAdminGuard();

  it('rejects unauthenticated requests', () => {
    expect(() =>
      guard.canActivate(contextFor({ params: { id: COMPETITION_ID } })),
    ).toThrow(UnauthorizedException);
  });

  it('rejects participants attempting admin operations', () => {
    expect(() =>
      guard.canActivate(
        contextFor({
          user: { id: 'u1', role: UserRole.EMPLOYER },
          params: { id: COMPETITION_ID },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows admins', () => {
    expect(
      guard.canActivate(
        contextFor({
          user: { id: 'admin', role: UserRole.ADMIN },
          params: { id: COMPETITION_ID },
        }),
      ),
    ).toBe(true);
  });
});

describe('CompetitionObserverGuard', () => {
  it('rejects a signed-in user who is not on the roster', async () => {
    const guard = new CompetitionObserverGuard(
      prismaStub({ participant: null }) as never,
    );

    await expect(
      guard.canActivate(
        contextFor({
          user: { id: 'stranger', role: UserRole.EMPLOYER },
          params: { id: COMPETITION_ID },
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a registered participant', async () => {
    const guard = new CompetitionObserverGuard(
      prismaStub({ participant: { id: 'p1' } }) as never,
    );

    await expect(
      guard.canActivate(
        contextFor({
          user: { id: 'u1', role: UserRole.EMPLOYER },
          params: { id: COMPETITION_ID },
        }),
      ),
    ).resolves.toBe(true);
  });

  it('reports unknown competitions instead of leaking membership state', async () => {
    const guard = new CompetitionObserverGuard(
      prismaStub({ competitionExists: false }) as never,
    );

    await expect(
      guard.canActivate(
        contextFor({
          user: { id: 'admin', role: UserRole.ADMIN },
          params: { id: COMPETITION_ID },
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('CompetitionParticipantGuard', () => {
  it('rejects a user registered for a different competition', async () => {
    const prisma = prismaStub({ participant: null });
    const guard = new CompetitionParticipantGuard(prisma as never);

    await expect(
      guard.canActivate(
        contextFor({
          user: { id: 'u1', role: UserRole.EMPLOYER },
          params: { id: COMPETITION_ID },
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.competitionParticipant.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          competitionId_userId: {
            competitionId: COMPETITION_ID,
            userId: 'u1',
          },
        },
      }),
    );
  });

  it('attaches the participant for downstream handlers', async () => {
    const guard = new CompetitionParticipantGuard(
      prismaStub({ participant: { id: 'p1' } }) as never,
    );
    const request: RequestShape = {
      user: { id: 'u1', role: UserRole.EMPLOYER },
      params: { id: COMPETITION_ID },
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.competitionParticipant).toEqual({ id: 'p1' });
  });
});
