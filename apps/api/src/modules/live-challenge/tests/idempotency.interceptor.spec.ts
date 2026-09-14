import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { IdempotencyInterceptor } from '../interceptors/idempotency/idempotency.interceptor.js';

describe('IdempotencyInterceptor', () => {
  it('copies Idempotency-Key onto the request body when absent', () => {
    const interceptor = new IdempotencyInterceptor();
    const body: Record<string, unknown> = { title: 'Engineer' };
    const request = {
      headers: { 'idempotency-key': '  key-123456  ' },
      body,
      idempotencyKey: undefined as string | undefined,
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    const next: CallHandler = { handle: () => of({ ok: true }) };

    interceptor.intercept(context, next).subscribe();

    expect(request.idempotencyKey).toBe('key-123456');
    expect(body.idempotencyKey).toBe('key-123456');
  });

  it('does not overwrite an explicit body idempotencyKey', () => {
    const interceptor = new IdempotencyInterceptor();
    const body: Record<string, unknown> = {
      title: 'Engineer',
      idempotencyKey: 'body-key',
    };
    const request = {
      headers: { 'idempotency-key': 'header-key' },
      body,
      idempotencyKey: undefined as string | undefined,
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    interceptor
      .intercept(context, { handle: () => of({ ok: true }) })
      .subscribe();

    expect(request.idempotencyKey).toBe('header-key');
    expect(body.idempotencyKey).toBe('body-key');
  });
});
