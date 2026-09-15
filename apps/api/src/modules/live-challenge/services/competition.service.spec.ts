import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CompetitionStatus } from '../../../generated/prisma/client.js';
import { WS_EVENTS } from '../ws-events.js';
import { CompetitionService } from './competition.service.js';

const COMPETITION_ID = '11111111-1111-1111-1111-111111111111';
const ROUND_ID = '22222222-2222-2222-2222-222222222222';

describe('CompetitionService', () => {
  let service: CompetitionService;
  let prisma: any;
  let realtime: any;

  beforeEach(() => {
    prisma = {
      competition: {
        create: vi.fn(() =>
          Promise.resolve({
            id: COMPETITION_ID,
            name: 'Test Competition',
            status: CompetitionStatus.DRAFT,
          }),
        ),
        findUnique: vi.fn((args: any) => {
          if (args.where.id === COMPETITION_ID) {
            return Promise.resolve({
              id: COMPETITION_ID,
              name: 'Test Competition',
              status: CompetitionStatus.DRAFT,
              activeRoundId: ROUND_ID,
              rounds: [],
            });
          }
          return Promise.resolve(null);
        }),
        update: vi.fn((args: any) =>
          Promise.resolve({
            id: COMPETITION_ID,
            activeRoundId: args.data.activeRoundId,
            status: args.data.status ?? CompetitionStatus.DRAFT,
          }),
        ),
      },
      round: {
        findUnique: vi.fn((args: any) => {
          if (args.where.id === ROUND_ID) {
            return Promise.resolve({
              id: ROUND_ID,
              competitionId: COMPETITION_ID,
              roundNumber: 1,
              name: 'Round 1',
              status: 'LIVE',
            });
          }
          return Promise.resolve(null);
        }),
      },
      competitionEvent: {
        create: vi.fn(() => Promise.resolve({})),
      },
      $transaction: vi.fn((fn: any) => fn(prisma)),
    };

    realtime = {
      emitActiveRoundChanged: vi.fn(),
    };

    const leaderboard = {
      getLeaderboard: vi.fn(() => Promise.resolve({ participants: [] })),
    };

    const timer = {
      buildSnapshot: vi.fn(() => ({ time_remaining_seconds: 300 })),
    };

    service = new CompetitionService(
      prisma as never,
      realtime as never,
      leaderboard as never,
      timer as never,
    );
  });

  it('creates a competition container', async () => {
    const created = await service.create({ name: 'Test Competition' });
    expect(created.id).toBe(COMPETITION_ID);
    expect(prisma.competition.create).toHaveBeenCalled();
  });

  it('finds a competition by id', async () => {
    const comp = await service.findOne(COMPETITION_ID);
    expect(comp.id).toBe(COMPETITION_ID);
  });

  it('throws NotFoundException for non-existent competition', async () => {
    await expect(service.findOne('non-existent')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('sets active round and emits active round changed event', async () => {
    await service.setActiveRound(COMPETITION_ID, ROUND_ID);
    expect(prisma.competition.update).toHaveBeenCalledWith({
      where: { id: COMPETITION_ID },
      data: { activeRoundId: ROUND_ID },
    });
    expect(realtime.emitActiveRoundChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        event: WS_EVENTS.ACTIVE_ROUND_CHANGED,
        competition_id: COMPETITION_ID,
        active_round_id: ROUND_ID,
      }),
    );
  });

  it('throws BadRequestException if setting active round from another competition', async () => {
    prisma.round.findUnique.mockResolvedValueOnce({
      id: 'other-round',
      competitionId: 'other-competition',
    });

    await expect(
      service.setActiveRound(COMPETITION_ID, 'other-round'),
    ).rejects.toThrow(BadRequestException);
  });
});
