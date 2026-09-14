import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UserRole } from '../../../../generated/prisma/client.js';
import type { AuthUser } from '../../../auth/auth.service.js';

@Injectable()
export class CompetitionAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;
    if (!user) {
      throw new UnauthorizedException();
    }
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Competition admin role required');
    }
    return true;
  }
}
