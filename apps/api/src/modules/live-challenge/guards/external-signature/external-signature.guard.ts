import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RawBodyRequest } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import {
  isExternalJobWebhookEnabled,
  resolveExternalJobWebhookSecret,
  resolveExternalJobWebhookSkewSeconds,
} from '../../../../config/external-job.config.js';
import { EXTERNAL_JOB_WEBHOOK } from '../../constants.js';

@Injectable()
export class ExternalSignatureGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    if (!isExternalJobWebhookEnabled(this.config)) {
      throw new ServiceUnavailableException(
        'External job webhook ingest is disabled',
      );
    }

    const request = context
      .switchToHttp()
      .getRequest<RawBodyRequest<Request>>();

    const secret = resolveExternalJobWebhookSecret(this.config);
    if (!secret) {
      throw new UnauthorizedException('External job webhook is not configured');
    }

    const timestampHeader = headerValue(
      request.headers[EXTERNAL_JOB_WEBHOOK.TIMESTAMP_HEADER],
    );
    const signatureHeader = headerValue(
      request.headers[EXTERNAL_JOB_WEBHOOK.SIGNATURE_HEADER],
    );

    if (!timestampHeader || !signatureHeader) {
      throw new UnauthorizedException('Missing webhook signature headers');
    }

    const timestampSeconds = Number(timestampHeader);
    if (!Number.isFinite(timestampSeconds)) {
      throw new UnauthorizedException('Invalid webhook timestamp');
    }

    const skewSeconds = resolveExternalJobWebhookSkewSeconds(this.config);
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSeconds - timestampSeconds) > skewSeconds) {
      throw new UnauthorizedException(
        'Webhook timestamp is outside the allowed window',
      );
    }

    const rawBody = request.rawBody;
    if (!rawBody || rawBody.length === 0) {
      throw new UnauthorizedException('Missing webhook body');
    }

    const payload = `${timestampHeader}.${rawBody.toString('utf8')}`;
    const expectedHex = createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    const providedHex = signatureHeader.startsWith('sha256=')
      ? signatureHeader.slice('sha256='.length)
      : signatureHeader;

    if (!safeEqualHex(expectedHex, providedHex)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    return true;
  }
}

function headerValue(value: string | string[] | undefined): string | null {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0].trim();
  }
  return null;
}

function safeEqualHex(expectedHex: string, providedHex: string): boolean {
  try {
    const expected = Buffer.from(expectedHex, 'hex');
    const provided = Buffer.from(providedHex, 'hex');
    if (expected.length === 0 || expected.length !== provided.length) {
      return false;
    }
    return timingSafeEqual(expected, provided);
  } catch {
    return false;
  }
}
