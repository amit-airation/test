import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { RateLimit } from '../../common/throttler/rate-limit.decorator.js';
import { RATE_LIMIT_POLICIES } from '../../common/throttler/rate-limit.policies.js';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto/login.dto.js';
import { ProvisionAdminDto } from './dto/provision-admin.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { AdminProvisioningGuard } from './guards/admin-provisioning/admin-provisioning.guard.js';

@Controller('auth')
@RateLimit(RATE_LIMIT_POLICIES.AUTH)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('admins')
  @UseGuards(AdminProvisioningGuard)
  provisionAdmin(@Body() dto: ProvisionAdminDto) {
    return this.authService.provisionAdmin(dto);
  }
}
