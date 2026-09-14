import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import type { AuthUser } from '../../../auth/auth.service.js';

@Injectable()
export class CompetitionParticipantGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user?: AuthUser;
      params: { id: string };
      competitionParticipant?: unknown;
    }>();
    const user = request.user;
    if (!user) {
      throw new UnauthorizedException();
    }

    const competitionId = request.params.id;
    const participant = await this.prisma.competitionParticipant.findUnique({
      where: {
        competitionId_userId: {
          competitionId,
          userId: user.id,
        },
      },
    });

    if (!participant) {
      throw new ForbiddenException(
        'You are not a registered participant for this competition',
      );
    }

    request.competitionParticipant = participant;
    return true;
  }
}
