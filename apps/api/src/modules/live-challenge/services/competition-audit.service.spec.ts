import { CompetitionEventType } from '../../../generated/prisma/client.js';
import { CompetitionAuditService } from './competition-audit.service.js';

function build() {
  const prisma = {
    competitionEvent: {
      create: vi.fn((args: any) => Promise.resolve({ id: 'e1', ...args.data })),
      findMany: vi.fn(() => Promise.resolve([{ id: 'e1' }])),
      count: vi.fn(() => Promise.resolve(1)),
    },
  };
  return { service: new CompetitionAuditService(prisma as never), prisma };
}

describe('CompetitionAuditService', () => {
  it('records an event against its competition and participant', async () => {
    const { service, prisma } = build();

    await service.record({
      competitionId: 'c1',
      participantId: 'p1',
      eventType: CompetitionEventType.SCREEN_SHARE_STARTED,
    });

    expect(prisma.competitionEvent.create).toHaveBeenCalledWith({
      data: {
        competitionId: 'c1',
        participantId: 'p1',
        eventType: CompetitionEventType.SCREEN_SHARE_STARTED,
        metadata: undefined,
      },
    });
  });

  it('scopes every query to the requested competition', async () => {
    const { service, prisma } = build();

    await service.list('c1', {
      eventType: CompetitionEventType.PUBLISH_FAILED,
      participantId: 'p1',
      limit: 25,
      offset: 50,
    });

    expect(prisma.competitionEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          competitionId: 'c1',
          eventType: CompetitionEventType.PUBLISH_FAILED,
          participantId: 'p1',
        },
        take: 25,
        skip: 50,
        orderBy: { createdAt: 'desc' },
      }),
    );
  });

  it('returns a bounded page by default', async () => {
    const { service, prisma } = build();

    const result = await service.list('c1');

    expect(prisma.competitionEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { competitionId: 'c1' }, take: 100 }),
    );
    expect(result).toMatchObject({
      competition_id: 'c1',
      total: 1,
      limit: 100,
      offset: 0,
    });
  });
});
