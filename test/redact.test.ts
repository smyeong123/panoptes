import { describe, expect, it } from 'vitest';
import { redact } from '../server/redact.ts';

describe('redact', () => {
  const cases: [string, string, string][] = [
    ['private key', '-----BEGIN RSA PRIVATE KEY-----\nMIIabc\n-----END RSA PRIVATE KEY-----', '[REDACTED:private-key]'],
    ['aws', 'id AKIAABCDEFGHIJKLMNOP', 'id [REDACTED:aws-key]'],
    ['github', `ghp_${'a'.repeat(36)}`, '[REDACTED:github-token]'],
    ['slack', 'xoxb-1234567890-abcdef', '[REDACTED:slack-token]'],
    ['api key', 'sk-ant-abcdefghijklmnopqrstuv', '[REDACTED:api-key]'],
    ['google', `AIza${'b'.repeat(35)}`, '[REDACTED:google-key]'],
    ['jwt', 'eyJhbGciOiJI.eyJzdWIiOiIx.c2lnbmF0dXJlMTIz', '[REDACTED:jwt]'],
    ['bearer', 'Authorization: Bearer abcdefghijklmnop1234', 'Authorization: Bearer [REDACTED]'],
    ['url', 'postgres://admin:hunter2@db:5432/x', 'postgres://[REDACTED]@db:5432/x'],
    ['assignment', 'DB_PASSWORD="hunter2" next', 'DB_PASSWORD=[REDACTED] next'],
  ];
  for (const [name, input, want] of cases) {
    it(name, () => expect(redact(input)).toBe(want));
  }

  it('평범한 문장은 그대로 둔다', () => {
    expect(redact('git status && npm test')).toBe('git status && npm test');
  });
});
