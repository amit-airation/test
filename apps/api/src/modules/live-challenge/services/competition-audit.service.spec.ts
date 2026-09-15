import { CompetitionEventType } from '../../../generated/prisma/client.js';
import { CompetitionAuditService } from './competition-audit.service.js';

function build() {
  const prisma = {
    competitionEvent: {
      create: vi.fn((args: any) => Promise.resolve({ id: 'e1', ...args.data })),
    },
  };
  return { service: new CompetitionAuditService(prisma as never), prisma };
}

describe('CompetitionAuditService', () => {
  it('records an event against its competition, round and participant', async () => {
    const { service, prisma } = build();

    await service.record({
      competitionId: 'c1',
      roundId: 'r1',
      roundParticipantId: 'p1',
      eventType: CompetitionEventType.SCREEN_SHARE_STARTED,
    });

    expect(prisma.competitionEvent.create).toHaveBeenCalledWith({
      data: {
        competitionId: 'c1',
        roundId: 'r1',
        roundParticipantId: 'p1',
        eventType: CompetitionEventType.SCREEN_SHARE_STARTED,
        metadata: undefined,
      },
    });
  });
});
