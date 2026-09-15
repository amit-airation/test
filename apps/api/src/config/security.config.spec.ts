import { assertSecureRuntimeConfig } from './security.config.js';

const STRONG = 'x'.repeat(40);

function configFor(values: Record<string, string | undefined>) {
  return {
    get: (key: string) => values[key],
  } as never;
}

describe('assertSecureRuntimeConfig', () => {
  const productionBase = {
    NODE_ENV: 'production',
    EVENT_ACCESS_KEY: STRONG,
    ADMIN_KEY: STRONG,
    CORS_ORIGIN: 'https://live.hirance.test',
    EXTERNAL_JOB_WEBHOOK_SECRET: STRONG,
  };

  it('passes on a fully configured production environment', () => {
    expect(() =>
      assertSecureRuntimeConfig(configFor(productionBase)),
    ).not.toThrow();
  });

  it('rejects a wildcard CORS origin in production', () => {
    expect(() =>
      assertSecureRuntimeConfig(
        configFor({ ...productionBase, CORS_ORIGIN: '*' }),
      ),
    ).toThrow(/CORS_ORIGIN/);
  });

  it('rejects missing or short EVENT_ACCESS_KEY in production', () => {
    expect(() =>
      assertSecureRuntimeConfig(
        configFor({ ...productionBase, EVENT_ACCESS_KEY: 'short' }),
      ),
    ).toThrow(/EVENT_ACCESS_KEY/);
  });

  it('skips production-only checks in development', () => {
    expect(() =>
      assertSecureRuntimeConfig(configFor({})),
    ).not.toThrow();
  });
});
