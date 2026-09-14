import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { UserRole } from '../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import type { AuthUser } from '../../../auth/auth.service.js';

@Injectable()
export class CompetitionObserverGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user?: AuthUser;
      params: { id: string };
    }>();
    const user = request.user;
    if (!user) {
      throw new UnauthorizedException();
    }

    const competition = await this.prisma.competition.findUnique({
      where: { id: request.params.id },
      select: { id: true },
    });
    if (!competition) {
      throw new NotFoundException(
        `Competition ${request.params.id} not found`,
      );
    }

    if (user.role === UserRole.ADMIN) {
      return true;
    }

    const participant =
      await this.prisma.competitionParticipant.findUnique({
        where: {
          competitionId_userId: {
            competitionId: request.params.id,
            userId: user.id,
          },
        },
        select: { id: true },
      });

    if (!participant) {
      throw new ForbiddenException(
        'Observer access requires an administrator or registered participant',
      );
    }

    return true;
  }
}
