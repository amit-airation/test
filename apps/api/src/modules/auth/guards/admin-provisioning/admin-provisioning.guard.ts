import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { timingSafeEqual } from 'node:crypto';
import { UserRole } from '../../../../generated/prisma/client.js';
import { resolveJwtSecret } from '../../../../config/security.config.js';
import { AuthService } from '../../auth.service.js';

export const ADMIN_BOOTSTRAP_HEADER = 'x-admin-bootstrap-token';

/**
 * Admin accounts can only be created by an existing admin, or — for the very
 * first account — by presenting the out-of-band ADMIN_BOOTSTRAP_TOKEN.
 * Provisioning stays closed when no token is configured.
 */
@Injectable()
export class AdminProvisioningGuard implements CanActivate {
  private readonly logger = new Logger(AdminProvisioningGuard.name);

  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();

    if (await this.isExistingAdmin(request.headers.authorization)) {
      return true;
    }

    if (await this.hasValidBootstrapToken(request.headers[ADMIN_BOOTSTRAP_HEADER])) {
      return true;
    }

    this.logger.warn({ event: 'admin_provisioning_denied' });
    throw new ForbiddenException(
      'Admin provisioning requires an existing admin session or a valid bootstrap token',
    );
  }

  private async isExistingAdmin(
    authorization: string | string[] | undefined,
  ): Promise<boolean> {
    const header = Array.isArray(authorization)
      ? authorization[0]
      : authorization;
    if (!header?.startsWith('Bearer ')) {
      return false;
    }

    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(
        header.slice(7),
        { secret: resolveJwtSecret(this.config) },
      );
      const user = await this.authService.validateUserById(payload.sub);
      return user?.role === UserRole.ADMIN;
    } catch {
      return false;
    }
  }

  /**
   * Bootstrap is first-admin only. Once any ADMIN exists the out-of-band
   * token is rejected so it cannot remain a permanent backdoor.
   */
  private async hasValidBootstrapToken(
    provided: string | string[] | undefined,
  ): Promise<boolean> {
    const expected = this.config.get<string>('ADMIN_BOOTSTRAP_TOKEN')?.trim();
    const candidate = Array.isArray(provided) ? provided[0] : provided;
    if (!expected || !candidate) {
      return false;
    }

    const expectedBuffer = Buffer.from(expected);
    const candidateBuffer = Buffer.from(candidate);
    const matches =
      expectedBuffer.length === candidateBuffer.length &&
      timingSafeEqual(expectedBuffer, candidateBuffer);
    if (!matches) {
      return false;
    }

    const adminCount = await this.authService.countAdmins();
    if (adminCount > 0) {
      this.logger.warn({
        event: 'admin_bootstrap_token_rejected_after_first_admin',
        admin_count: adminCount,
      });
      throw new ForbiddenException(
        'Bootstrap token is disabled after the first admin exists; sign in as an admin to provision more',
      );
    }

    return true;
  }
}
