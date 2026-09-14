import {
  RoomServiceClient,
  TrackSource,
} from 'livekit-server-sdk';
import {
  CompetitionStatus,
  ParticipantStatus,
  UserRole,
} from '../../../generated/prisma/client.js';
import {
  parseScreenSharePublisherUserId,
  ScreenShareService,
  screenSharePublisherIdentity,
  screenShareRoomName,
} from './screen-share.service.js';

const deleteRoom = vi.fn().mockResolvedValue(undefined);
const removeParticipant = vi.fn().mockResolvedValue(undefined);

vi.mock('livekit-server-sdk', () => {
  class MockAccessToken {
    grants: unknown[] = [];
    constructor(
      public apiKey: string,
      public apiSecret: string,
      public options: Record<string, unknown>,
    ) {}
    addGrant(grant: unknown) {
      this.grants.push(grant);
    }
    toJwt() {
      return Promise.resolve('signed-livekit-token');
    }
  }
  return {
    AccessToken: MockAccessToken,
    RoomServiceClient: vi.fn(function RoomServiceClient() {
      return { deleteRoom, removeParticipant };
    }),
    TrackSource: { SCREEN_SHARE: 3, SCREEN_SHARE_AUDIO: 4 },
  };
});

function build(options?: {
  configured?: boolean;
  competition?: Record<string, unknown> | null;
  participant?: Record<string, unknown> | null;
}) {
  const configured = options?.configured ?? true;
  const config = {
    get: (key: string) => {
      if (!configured) return undefined;
      if (key === 'LIVEKIT_URL') return 'http://localhost:7880';
      if (key === 'LIVEKIT_API_KEY') return 'devkey';
      if (key === 'LIVEKIT_API_SECRET') return 'secret';
      if (key === 'LIVEKIT_PUBLIC_URL') return 'ws://localhost:7880';
      return undefined;
    },
  };
  const prisma = {
    competition: {
      findUnique: vi.fn(() =>
        Promise.resolve(
          options?.competition === null
            ? null
            : {
                id: 'c1',
                status: CompetitionStatus.LIVE,
                endAt: new Date(Date.now() + 120_000),
                ...options?.competition,
              },
        ),
      ),
    },
    competitionParticipant: {
      findUnique: vi.fn(() =>
        Promise.resolve(
          options?.participant === undefined
            ? {
                id: 'p1',
                userId: 'u1',
                status: ParticipantStatus.ACTIVE,
              }
            : options.participant,
        ),
      ),
    },
  };
  const service = new ScreenShareService(config as never, prisma as never);
  return { service, prisma };
}

describe('ScreenShareService', () => {
  beforeEach(() => {
    deleteRoom.mockClear();
    removeParticipant.mockClear();
  });

  it('reports configured=false when LiveKit env is missing', () => {
    const { service } = build({ configured: false });
    expect(service.getStatus()).toEqual({ configured: false });
  });

  it('issues a publish token for a LIVE participant', async () => {
    const { service } = build();
    const result = await service.issueToken(
      'c1',
      {
        id: 'u1',
        email: 'a@example.com',
        name: 'Ada',
        role: UserRole.EMPLOYER,
      },
      'publish',
    );

    expect(result.token).toBe('signed-livekit-token');
    expect(result.can_publish).toBe(true);
    expect(result.identity).toBe(screenSharePublisherIdentity('u1'));
    expect(result.room).toBe(screenShareRoomName('c1'));
    expect(TrackSource.SCREEN_SHARE).toBeDefined();
  });

  it('rejects publish when the competition is not LIVE', async () => {
    const { service } = build({
      competition: { status: CompetitionStatus.ENDED },
    });
    await expect(
      service.issueToken(
        'c1',
        {
          id: 'u1',
          email: 'a@example.com',
          name: 'Ada',
          role: UserRole.EMPLOYER,
        },
        'publish',
      ),
    ).rejects.toThrow(/LIVE/);
  });

  it('rejects publish for disqualified participants', async () => {
    const { service } = build({
      participant: {
        id: 'p1',
        userId: 'u1',
        status: ParticipantStatus.DISQUALIFIED,
      },
    });
    await expect(
      service.issueToken(
        'c1',
        {
          id: 'u1',
          email: 'a@example.com',
          name: 'Ada',
          role: UserRole.EMPLOYER,
        },
        'publish',
      ),
    ).rejects.toThrow(/Disqualified/);
  });

  it('allows admins to watch without being on the roster', async () => {
    const { service } = build({ participant: null });
    const result = await service.issueToken(
      'c1',
      {
        id: 'admin-1',
        email: 'admin@example.com',
        name: 'Admin',
        role: UserRole.ADMIN,
      },
      'watch',
    );
    expect(result.can_publish).toBe(false);
    expect(result.identity).toBe('subscriber:admin-1');
  });

  it('closes rooms and kicks publishers through RoomServiceClient', async () => {
    const { service } = build();
    await service.closeRoom('c1');
    await service.kickPublisher('c1', 'u1');
    expect(RoomServiceClient).toHaveBeenCalled();
    expect(deleteRoom).toHaveBeenCalledWith(screenShareRoomName('c1'));
    expect(removeParticipant).toHaveBeenCalledWith(
      screenShareRoomName('c1'),
      screenSharePublisherIdentity('u1'),
    );
  });

  it('parses publisher identities', () => {
    expect(parseScreenSharePublisherUserId('publisher:abc')).toBe('abc');
    expect(parseScreenSharePublisherUserId('subscriber:abc')).toBeNull();
  });
});
