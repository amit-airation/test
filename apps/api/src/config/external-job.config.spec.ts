import { describe, expect, it } from 'vitest';
import {
  isExternalJobWebhookEnabled,
  resolveExternalJobWebhookSkewSeconds,
} from './external-job.config.js';

function configFor(values: Record<string, string | undefined>) {
  return {
    get: (key: string) => values[key],
  } as never;
}

describe('external-job.config', () => {
  it('enables the webhook by default', () => {
    expect(isExternalJobWebhookEnabled(configFor({}))).toBe(true);
    expect(
      isExternalJobWebhookEnabled(
        configFor({ EXTERNAL_JOB_WEBHOOK_ENABLED: 'false' }),
      ),
    ).toBe(false);
  });

  it('falls back to the default skew window', () => {
    expect(resolveExternalJobWebhookSkewSeconds(configFor({}))).toBe(300);
    expect(
      resolveExternalJobWebhookSkewSeconds(
        configFor({ EXTERNAL_JOB_WEBHOOK_SKEW_SECONDS: '120' }),
      ),
    ).toBe(120);
  });
});
