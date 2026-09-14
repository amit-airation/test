import { CompetitionEventType } from '../../../generated/prisma/client.js';
import { CompetitionPresenceService } from '../services/competition-presence.service.js';

type RedisStub = {
  connect: ReturnType<typeof vi.fn>;
  quit: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
  exists: ReturnType<typeof vi.fn>;
  expire: ReturnType<typeof vi.fn>;
  eval: ReturnType<typeof vi.fn>;
};

vi.mock('ioredis', () => {
  return {
    Redis: vi.fn(function Redis(this: RedisStub) {
      this.connect = vi.fn().mockResolvedValue(undefined);
      this.quit = vi.fn().mockResolvedValue('OK');
      this.get = vi.fn().mockResolvedValue(null);
      this.set = vi.fn().mockResolvedValue('OK');
      this.del = vi.fn().mockResolvedValue(1);
      this.exists = vi.fn().mockResolvedValue(0);
      this.expire = vi.fn().mockResolvedValue(1);
      this.eval = vi.fn().mockResolvedValue(null);
      return this;
    }),
  };
});

describe('CompetitionPresenceService session ownership', () => {
  function build() {
    const audit = {
      record: vi.fn().mockResolvedValue({ id: 'evt-1' }),
    };
    const prisma = {
      competitionParticipant: {
        update: vi.fn().mockResolvedValue({}),
      },
      competitionEvent: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    const service = new CompetitionPresenceService(
      { get: () => undefined } as never,
      prisma as never,
      audit as never,
    );
    const redis = (service as unknown as { redis: RedisStub }).redis;
    return { service, redis, audit, prisma };
  }

  it('claims a session and reports the previous owner for kick', async () => {
    const { service, redis } = build();
    redis.eval.mockResolvedValueOnce('old-socket');

    await expect(
      service.claimSession('comp-1', 'part-1', 'new-socket'),
    ).resolves.toEqual({ supersededSocketId: 'old-socket' });
    expect(redis.eval).toHaveBeenCalled();
  });

  it('does not release a session owned by a newer socket', async () => {
    const { service, redis } = build();
    redis.get.mockResolvedValueOnce('new-socket');

    await expect(
      service.releaseSession('comp-1', 'part-1', 'old-socket'),
    ).resolves.toBe(false);
    expect(redis.del).not.toHaveBeenCalled();
  });

  it('releases and audits disconnect only for the owning socket', async () => {
    const { service, redis, audit } = build();
    redis.get.mockResolvedValueOnce('socket-1');

    await expect(
      service.releaseSession('comp-1', 'part-1', 'socket-1'),
    ).resolves.toBe(true);
    await service.markDisconnected('comp-1', 'part-1', { persistEvent: true });

    expect(redis.del).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        competitionId: 'comp-1',
        participantId: 'part-1',
        eventType: CompetitionEventType.DISCONNECTED,
      }),
    );
  });
});
