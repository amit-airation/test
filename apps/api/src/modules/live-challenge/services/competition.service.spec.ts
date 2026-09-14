import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  CompetitionEventType,
  CompetitionStatus,
  ParticipantStatus,
} from '../../../generated/prisma/client.js';
import { WS_EVENTS } from '../ws-events.js';
import { CompetitionService } from './competition.service.js';

const COMPETITION_ID = 'c1';

function build(options: {
  competition?: Record<string, unknown>;
  participant?: Record<string, unknown> | null;
}) {
  const tx = {
    competitionParticipant: {
      update: vi.fn((args: any) =>
        Promise.resolve({
          id: 'p1',
          userId: 'u1',
          status: args.data.status,
          user: { id: 'u1', name: 'Ada' },
        }),
      ),
    },
    competitionEvent: { create: vi.fn(() => Promise.resolve({})) },
  };
  const prisma = {
    competition: {
      findUnique: vi.fn(() =>
        Promise.resolve({
          id: COMPETITION_ID,
          status: CompetitionStatus.LIVE,
          allowOpenJoin: false,
          durationSeconds: 300,
          ...options.competition,
        }),
      ),
    },
    competitionParticipant: {
      findUnique: vi.fn(() => Promise.resolve(options.participant ?? null)),
      create: vi.fn(() => Promise.resolve({ id: 'p-new' })),
    },
    companyMembership: {
      findFirst: vi.fn(() => Promise.resolve({ companyId: 'co1' })),
      findUnique: vi.fn(() => Promise.resolve({ companyId: 'co1' })),
    },
    user: { update: vi.fn(() => Promise.resolve({})) },
    $transaction: vi.fn((fn: any) => fn(tx)),
  };
  const realtime = { emitPresence: vi.fn() };
  const audit = { record: vi.fn(() => Promise.resolve({})), list: vi.fn() };
  const service = new CompetitionService(
    prisma as never,
    {} as never,
    { getLeaderboard: vi.fn() } as never,
    { buildSnapshot: vi.fn(() => ({})) } as never,
    realtime as never,
    audit as never,
    { kickPublisher: vi.fn(() => Promise.resolve()) } as never,
    { get: () => undefined } as never,
  );
  return { service, prisma, tx, realtime, audit };
}

describe('CompetitionService.join', () => {
  it('refuses a stranger when the roster is closed', async () => {
    const { service, prisma } = build({ participant: null });

    await expect(
      service.join(COMPETITION_ID, 'u1', {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.competitionParticipant.create).not.toHaveBeenCalled();
  });

  it('admits a stranger only when the admin opted into open join', async () => {
    const { service, prisma } = build({
      competition: { allowOpenJoin: true },
      participant: null,
    });

    await service.join(COMPETITION_ID, 'u1', {});
    expect(prisma.competitionParticipant.create).toHaveBeenCalled();
  });

  it('admits a pre-registered participant on a closed roster', async () => {
    const { service, prisma, tx } = build({
      participant: {
        id: 'p1',
        joinedAt: null,
        companyId: 'co1',
        status: ParticipantStatus.REGISTERED,
      },
    });

    const result = await service.join(COMPETITION_ID, 'u1', {});

    expect(prisma.competitionParticipant.create).not.toHaveBeenCalled();
    expect(result.status).toBe(ParticipantStatus.ACTIVE);
    expect(tx.competitionEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: CompetitionEventType.JOINED,
        }),
      }),
    );
  });

  it('refuses a disqualified participant', async () => {
    const { service } = build({
      participant: { id: 'p1', status: ParticipantStatus.DISQUALIFIED },
    });

    await expect(
      service.join(COMPETITION_ID, 'u1', {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('CompetitionService.disqualifyParticipant', () => {
  it('records the sanction with its reason and broadcasts it', async () => {
    const { service, tx, realtime } = build({
      participant: {
        id: 'p1',
        competitionId: COMPETITION_ID,
        userId: 'u1',
        status: ParticipantStatus.ACTIVE,
        user: { id: 'u1', name: 'Ada' },
      },
    });

    await service.disqualifyParticipant(
      COMPETITION_ID,
      'p1',
      'Third-party assistance',
      'admin-1',
    );

    expect(tx.competitionEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: CompetitionEventType.DISQUALIFIED,
          metadata: {
            reason: 'Third-party assistance',
            disqualifiedBy: 'admin-1',
          },
        }),
      }),
    );
    expect(realtime.emitPresence).toHaveBeenCalledWith(
      COMPETITION_ID,
      WS_EVENTS.PARTICIPANT_DISQUALIFIED,
      expect.objectContaining({ participant_id: 'p1' }),
    );
  });

  it('refuses a participant id from another competition', async () => {
    const { service } = build({
      participant: {
        id: 'p1',
        competitionId: 'other-competition',
        userId: 'u1',
        status: ParticipantStatus.ACTIVE,
        user: { id: 'u1', name: 'Ada' },
      },
    });

    await expect(
      service.disqualifyParticipant(COMPETITION_ID, 'p1', 'reason', 'admin-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('is idempotent for an already disqualified participant', async () => {
    const { service, tx } = build({
      participant: {
        id: 'p1',
        competitionId: COMPETITION_ID,
        userId: 'u1',
        status: ParticipantStatus.DISQUALIFIED,
        user: { id: 'u1', name: 'Ada' },
      },
    });

    await service.disqualifyParticipant(
      COMPETITION_ID,
      'p1',
      'reason',
      'admin-1',
    );
    expect(tx.competitionEvent.create).not.toHaveBeenCalled();
  });
});
