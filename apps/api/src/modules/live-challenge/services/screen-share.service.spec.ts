import { RoomServiceClient, TrackSource } from 'livekit-server-sdk';
import { ParticipantStatus, RoundStatus } from '../../../generated/prisma/client.js';
import {
  parseScreenSharePublisherCompanyId,
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
  round?: Record<string, unknown> | null;
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
    round: {
      findUnique: vi.fn(() =>
        Promise.resolve(
          options?.round === null
            ? null
            : {
                id: 'r1',
                status: RoundStatus.LIVE,
                endAt: new Date(Date.now() + 120_000),
                ...options?.round,
              },
        ),
      ),
    },
    roundParticipant: {
      findUnique: vi.fn(() =>
        Promise.resolve(
          options?.participant === undefined
            ? {
                id: 'p1',
                companyId: 'co1',
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

  it('issues a publish token for a LIVE round participant', async () => {
    const { service } = build();
    const result = await service.issueToken(
      'r1',
      'co1',
      'Jane Smith',
      'publish',
    );

    expect(result.token).toBe('signed-livekit-token');
    expect(result.can_publish).toBe(true);
    expect(result.identity).toBe(screenSharePublisherIdentity('co1'));
    expect(result.room).toBe(screenShareRoomName('r1'));
    expect(TrackSource.SCREEN_SHARE).toBeDefined();
  });

  it('rejects publish when the round is not LIVE', async () => {
    const { service } = build({
      round: { status: RoundStatus.ENDED },
    });
    await expect(
      service.issueToken('r1', 'co1', 'Jane Smith', 'publish'),
    ).rejects.toThrow(/LIVE/);
  });

  it('rejects publish for disqualified participants', async () => {
    const { service } = build({
      participant: {
        id: 'p1',
        companyId: 'co1',
        status: ParticipantStatus.DISQUALIFIED,
      },
    });
    await expect(
      service.issueToken('r1', 'co1', 'Jane Smith', 'publish'),
    ).rejects.toThrow(/Disqualified/);
  });

  it('allows observers to watch without being a registered participant', async () => {
    const { service } = build({ participant: null });
    const result = await service.issueToken('r1', null, 'Observer', 'watch');
    expect(result.can_publish).toBe(false);
    expect(result.identity).toMatch(/^subscriber:observer-/);
  });

  it('closes rooms and kicks publishers through RoomServiceClient', async () => {
    const { service } = build();
    await service.closeRoom('r1');
    await service.kickPublisher('r1', 'co1');
    expect(RoomServiceClient).toHaveBeenCalled();
    expect(deleteRoom).toHaveBeenCalledWith(screenShareRoomName('r1'));
    expect(removeParticipant).toHaveBeenCalledWith(
      screenShareRoomName('r1'),
      screenSharePublisherIdentity('co1'),
    );
  });

  it('parses publisher identities', () => {
    expect(parseScreenSharePublisherCompanyId('publisher:co1')).toBe('co1');
    expect(parseScreenSharePublisherCompanyId('subscriber:co1')).toBeNull();
  });
});
