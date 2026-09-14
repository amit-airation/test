import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UserRole } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { LoginDto } from './dto/login.dto/login.dto.js';
import { ProvisionAdminDto } from './dto/provision-admin.dto.js';
import { RegisterDto } from './dto/register.dto.js';

export type AuthUser = {  
  id: string;
  email: string;
  name: string;
  role: UserRole;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /** Public sign-up. The role is never caller-controlled. */
  register(dto: RegisterDto) {
    return this.createUser(dto, UserRole.EMPLOYER);
  }

  /** Guarded by AdminProvisioningGuard — see auth.controller. */
  provisionAdmin(dto: ProvisionAdminDto) {
    return this.createUser(dto, UserRole.ADMIN);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    const valid =
      user != null && (await bcrypt.compare(dto.password, user.passwordHash));
    if (!user || !valid) {
      this.logger.warn({ event: 'login_failed', email: dto.email });
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.issueToken(user);
  }

  async validateUserById(userId: string): Promise<AuthUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true },
    });
    return user;
  }

  countAdmins() {
    return this.prisma.user.count({ where: { role: UserRole.ADMIN } });
  }

  private async createUser(
    dto: { email: string; password: string; name: string },
    role: UserRole,
  ) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name,
        role,
      },
    });

    this.logger.log({
      event: 'user_provisioned',
      user_id: user.id,
      role: user.role,
    });

    return this.issueToken(user);
  }

  private issueToken(user: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
  }) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    return {
      access_token: this.jwt.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }
}
