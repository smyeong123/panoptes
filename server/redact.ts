// 세션 기록에는 비밀값이 섞여 있기 쉽다(env 출력, 토큰 붙은 curl, 붙여넣은 .env).
// 브라우저로 보내기 전에 흔한 모양을 가린다. 안전망일 뿐 완전하지 않다.
// agent-tail(src/shared/redact.ts)의 패턴을 그대로 가져왔다.

const PATTERNS: [string, RegExp][] = [
  ['private-key', /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g],
  ['aws-key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/g],
  ['slack-token', /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g],
  ['api-key', /\b(?:sk|pk|rk)-(?:ant-|proj-|live-|test-)?[A-Za-z0-9_-]{20,}\b/g],
  ['google-key', /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ['jwt', /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g],
  ['bearer', /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{16,}/gi],
  ['url-credentials', /(\b[a-z][a-z0-9+.-]*:\/\/)[^\s:@/]+:[^\s@/]+@/gi],
  [
    'assignment',
    /\b([A-Z0-9_]*(?:PASSWORD|PASSWD|SECRET|TOKEN|API_KEY|APIKEY|ACCESS_KEY|PRIVATE_KEY)[A-Z0-9_]*)\s*([=:])\s*("[^"\n]*"|'[^'\n]*'|[^\s'"]+)/gi,
  ],
];

export function redact(text: string): string {
  let out = text;
  for (const [name, re] of PATTERNS) {
    out = out.replace(re, (...m: string[]) => {
      if (name === 'bearer') return `${m[1]} [REDACTED]`;
      if (name === 'url-credentials') return `${m[1]}[REDACTED]@`;
      if (name === 'assignment') return `${m[1]}${m[2]}[REDACTED]`;
      return `[REDACTED:${name}]`;
    });
  }
  return out;
}
