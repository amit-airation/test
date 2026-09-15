import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

@Injectable()
export class EventKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const provided = (
      request.headers['x-event-key'] as string | undefined
    )?.trim();
    const expected = this.config.get<string>('EVENT_ACCESS_KEY', '').trim();

    if (!provided || !this.keysMatch(expected, provided)) {
      throw new UnauthorizedException('Invalid or missing event key');
    }
    return true;
  }

  private keysMatch(a: string, b: string): boolean {
    try {
      const bufA = Buffer.from(a, 'utf8');
      const bufB = Buffer.from(b, 'utf8');
      if (bufA.length === 0 || bufA.length !== bufB.length) return false;
      return timingSafeEqual(bufA, bufB);
    } catch {
      return false;
    }
  }
}
