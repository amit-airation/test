import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ExecutionContext } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { ExternalSignatureGuard } from '../guards/external-signature/external-signature.guard.js';
import { EXTERNAL_JOB_WEBHOOK } from '../constants.js';

const SECRET = 'webhook-secret-for-unit-tests-32ch';
const BODY = JSON.stringify({
  event_id: '11111111-1111-1111-1111-111111111111',
  event: 'JOB_PUBLISHED',
  company_id: 'hirance-company-123',
  external_job_id: 'hirance-job-987',
});

function sign(timestamp: string, body = BODY, secret = SECRET) {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

function context(headers: Record<string, string>, rawBody?: Buffer) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers,
        rawBody,
      }),
    }),
  } as unknown as ExecutionContext;
}

function makeGuard(secret: string | undefined = SECRET, skew = 300) {
  const config = {
    get: (key: string, fallback?: number) => {
      if (key === EXTERNAL_JOB_WEBHOOK.SECRET_ENV) return secret;
      if (key === EXTERNAL_JOB_WEBHOOK.SKEW_ENV) return skew;
      return fallback;
    },
  } as unknown as ConfigService;
  return new ExternalSignatureGuard(config);
}

describe('ExternalSignatureGuard', () => {
  it('accepts a valid HMAC over timestamp.rawBody', () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const guard = makeGuard();
    expect(
      guard.canActivate(
        context(
          {
            [EXTERNAL_JOB_WEBHOOK.TIMESTAMP_HEADER]: timestamp,
            [EXTERNAL_JOB_WEBHOOK.SIGNATURE_HEADER]: sign(timestamp),
          },
          Buffer.from(BODY),
        ),
      ),
    ).toBe(true);
  });

  it('accepts a sha256= prefixed signature', () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const guard = makeGuard();
    expect(
      guard.canActivate(
        context(
          {
            [EXTERNAL_JOB_WEBHOOK.TIMESTAMP_HEADER]: timestamp,
            [EXTERNAL_JOB_WEBHOOK.SIGNATURE_HEADER]: `sha256=${sign(timestamp)}`,
          },
          Buffer.from(BODY),
        ),
      ),
    ).toBe(true);
  });

  it('rejects a missing secret configuration', () => {
    const guard = makeGuard(undefined);
    expect(() =>
      guard.canActivate(context({}, Buffer.from(BODY))),
    ).toThrow(UnauthorizedException);
  });

  it('returns 503 when webhook ingest is disabled', () => {
    const config = {
      get: (key: string, fallback?: number) => {
        if (key === EXTERNAL_JOB_WEBHOOK.ENABLED_ENV) return 'false';
        if (key === EXTERNAL_JOB_WEBHOOK.SECRET_ENV) return SECRET;
        if (key === EXTERNAL_JOB_WEBHOOK.SKEW_ENV) return 300;
        return fallback;
      },
    } as unknown as ConfigService;
    const guard = new ExternalSignatureGuard(config);
    expect(() =>
      guard.canActivate(context({}, Buffer.from(BODY))),
    ).toThrow(/disabled/);
  });

  it('rejects an invalid signature', () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const guard = makeGuard();
    expect(() =>
      guard.canActivate(
        context(
          {
            [EXTERNAL_JOB_WEBHOOK.TIMESTAMP_HEADER]: timestamp,
            [EXTERNAL_JOB_WEBHOOK.SIGNATURE_HEADER]: 'deadbeef'.repeat(8),
          },
          Buffer.from(BODY),
        ),
      ),
    ).toThrow(UnauthorizedException);
  });

  it('rejects a replayed timestamp outside the skew window', () => {
    const timestamp = String(Math.floor(Date.now() / 1000) - 301);
    const guard = makeGuard();
    expect(() =>
      guard.canActivate(
        context(
          {
            [EXTERNAL_JOB_WEBHOOK.TIMESTAMP_HEADER]: timestamp,
            [EXTERNAL_JOB_WEBHOOK.SIGNATURE_HEADER]: sign(timestamp),
          },
          Buffer.from(BODY),
        ),
      ),
    ).toThrow(UnauthorizedException);
  });
});
