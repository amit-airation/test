import {
  assertSecureRuntimeConfig,
  resolveJwtSecret,
} from './security.config.js';

const STRONG = 'x'.repeat(40);

function configFor(values: Record<string, string | undefined>) {
  return {
    get: (key: string) => values[key],
  } as never;
}

describe('resolveJwtSecret', () => {
  it('refuses to boot production on a well-known secret', () => {
    expect(() =>
      resolveJwtSecret(
        configFor({ NODE_ENV: 'production', JWT_SECRET: 'change-me' }),
      ),
    ).toThrow(/JWT_SECRET/);
  });

  it('refuses to boot production on a short secret', () => {
    expect(() =>
      resolveJwtSecret(
        configFor({ NODE_ENV: 'production', JWT_SECRET: 'short-secret' }),
      ),
    ).toThrow(/JWT_SECRET/);
  });

  it('accepts a strong production secret', () => {
    expect(
      resolveJwtSecret(
        configFor({ NODE_ENV: 'production', JWT_SECRET: STRONG }),
      ),
    ).toBe(STRONG);
  });

  it('keeps development usable with a weak secret', () => {
    expect(
      resolveJwtSecret(configFor({ JWT_SECRET: 'change-me' })),
    ).toBe('change-me');
    expect(resolveJwtSecret(configFor({}))).toBeTruthy();
  });
});

describe('assertSecureRuntimeConfig', () => {
  const productionBase = {
    NODE_ENV: 'production',
    JWT_SECRET: STRONG,
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

  it('rejects a short admin bootstrap token', () => {
    expect(() =>
      assertSecureRuntimeConfig(
        configFor({ ...productionBase, ADMIN_BOOTSTRAP_TOKEN: 'abc' }),
      ),
    ).toThrow(/ADMIN_BOOTSTRAP_TOKEN/);
  });

  it('skips production-only checks in development', () => {
    expect(() =>
      assertSecureRuntimeConfig(configFor({ JWT_SECRET: 'change-me' })),
    ).not.toThrow();
  });
});
