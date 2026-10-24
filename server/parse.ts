import type { OfficeEvent } from '../shared/events.ts';
import { roomForTool } from '../shared/rooms.ts';
import { redact } from './redact.ts';

// 화면에는 요약만 보낸다. 툴 결과 본문이나 프롬프트 전문은 넘기지 않는다.
// 자르기 전에 가려야 잘림 경계에 걸친 키도 패턴에 걸린다.
export function clip(s: unknown, n: number): string {
  const t = redact(String(s ?? '')).replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

export function basename(p: unknown): string {
  return String(p ?? '').split(/[\\/]/).filter(Boolean).pop() ?? '';
}

function summarize(name: string, input: any): string {
  if (!input || typeof input !== 'object') return name;
  switch (name) {
    case 'Read':
    case 'Edit':
    case 'Write':
    case 'MultiEdit':
    case 'NotebookEdit':
    case 'NotebookRead':
      return basename(input.file_path ?? input.notebook_path);
    case 'Grep':
    case 'Glob':
      return clip(input.pattern, 40);
    case 'Bash':
    case 'PowerShell':
      return clip(input.description || input.command, 60);
    case 'WebSearch':
      return clip(input.query, 50);
    case 'WebFetch':
      try {
        return new URL(input.url).hostname;
      } catch {
        return 'WebFetch';
      }
    case 'AskUserQuestion':
      return clip(input.questions?.[0]?.question ?? '', 60);
    case 'ExitPlanMode':
      return ''; // 문구는 화면 언어에 맞춰 브라우저가 채운다
    case 'TaskCreate':
      return clip(input.subject, 40);
    case 'Skill':
      return clip(input.skill, 40);
    case 'SendMessage':
      return clip(input.to, 30);
  }
  if (name.startsWith('mcp__')) return name.split('__').slice(1).join(' · ');
  return name;
}

// 회의실 화이트보드에 쓸 줄
function boardLines(name: string, input: any): string[] | undefined {
  if (name === 'TodoWrite' && Array.isArray(input?.todos)) {
    const mark: Record<string, string> = { completed: '✔', in_progress: '▶', pending: '□' };
    return input.todos.slice(0, 7).map((t: any) => `${mark[t.status] ?? '□'} ${clip(t.content, 34)}`);
  }
  if (name === 'TaskCreate' && input?.subject) return [`□ ${clip(input.subject, 34)}`];
  if (name === 'ExitPlanMode' && typeof input?.plan === 'string') {
    return input.plan
      .split('\n')
      .filter((l: string) => /^#{1,3}\s/.test(l))
      .slice(0, 7)
      .map((l: string) => clip(l.replace(/^#+\s*/, ''), 36));
  }
  return undefined;
}

export function isGit(name: string, input: any): boolean {
  return (name === 'Bash' || name === 'PowerShell') && /(^|[\s;&|(])git\s/.test(String(input?.command ?? ''));
}

export function toolResultText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((c: any) => (c?.type === 'text' ? c.text : '')).join(' ');
  return '';
}

const NOTIFY_RE = /<task-notification>[\s\S]*?<tool-use-id>([^<]+)<\/tool-use-id>[\s\S]*?<status>([^<]+)<\/status>/;

function notification(text: string, ts: number): OfficeEvent[] {
  const m = NOTIFY_RE.exec(text);
  if (!m || m[2].trim() === 'running') return [];
  return [{ k: 'agentDone', ts, agent: 'main', toolUseId: m[1].trim() }];
}

const TEAMMATE_RE = /<teammate-message teammate_id="([^"]+)"[^>]*>\s*(\{[\s\S]*?\})\s*<\/teammate-message>/g;

// 팀메이트는 task-notification 대신 idle_notification으로 일이 끝났음을 알린다
function teammateIdle(text: string, ts: number): OfficeEvent[] {
  const out: OfficeEvent[] = [];
  for (const m of text.matchAll(TEAMMATE_RE)) {
    let o: any;
    try {
      o = JSON.parse(m[2]);
    } catch {
      continue;
    }
    if (o?.type !== 'idle_notification') continue;
    out.push({ k: 'teammateIdle', ts: Date.parse(o.timestamp) || ts, agent: 'main', name: String(o.from || m[1]) });
  }
  return out;
}

/** jsonl 한 줄을 사무실 이벤트로 바꾼다. agent는 'main' 또는 서브에이전트 키. */
export function parseLine(line: string, agent = 'main'): OfficeEvent[] {
  let o: any;
  try {
    o = JSON.parse(line);
  } catch {
    return [];
  }
  if (!o || typeof o !== 'object') return [];
  const ts = Date.parse(o.timestamp) || Date.now();
  const isSub = agent !== 'main';

  if (o.type === 'queue-operation') {
    if (o.operation === 'enqueue' && typeof o.content === 'string') return notification(o.content, ts);
    return [];
  }

  if (o.type === 'system') {
    return o.subtype === 'turn_duration' ? [{ k: 'turnEnd', ts, agent }] : [];
  }

  if (o.type === 'assistant') {
    const content = o.message?.content;
    if (!Array.isArray(content)) return [];
    const out: OfficeEvent[] = [];
    let usedTool = false;
    for (const c of content) {
      if (c?.type === 'thinking') {
        out.push({ k: 'think', ts, agent, text: clip(c.thinking, 90) });
      } else if (c?.type === 'text') {
        const text = clip(c.text, 70);
        if (text) out.push({ k: 'say', ts, agent, text });
      } else if (c?.type === 'tool_use') {
        usedTool = true;
        const name = String(c.name);
        const input = c.input ?? {};
        out.push({
          k: 'tool',
          ts,
          agent,
          id: String(c.id),
          name,
          room: roomForTool(name),
          label: summarize(name, input),
          git: isGit(name, input) || undefined,
          board: boardLines(name, input),
        });
        if (name === 'Agent' || name === 'Task') {
          out.push({
            k: 'spawn',
            ts,
            agent,
            toolUseId: String(c.id),
            subagentType: String(input.subagent_type || 'general-purpose'),
            description: clip(input.description, 40),
          });
        }
      }
    }
    // 서브에이전트는 turn_duration을 남기지 않으므로 end_turn을 턴 끝으로 본다
    if (isSub && !usedTool && o.message?.stop_reason === 'end_turn') out.push({ k: 'turnEnd', ts, agent });
    return out;
  }

  if (o.type === 'user') {
    if (o.isMeta || o.isCompactSummary) return [];
    const content = o.message?.content;
    if (typeof content === 'string') {
      if (content.includes('<task-notification>')) return notification(content, ts);
      if (content.includes('<teammate-message')) return isSub ? [] : teammateIdle(content, ts);
      if (isSub || content.startsWith('<') || content.startsWith('This session is being continued')) return [];
      const text = clip(content, 60);
      return text ? [{ k: 'prompt', ts, agent, text }] : [];
    }
    if (!Array.isArray(content)) return [];
    const out: OfficeEvent[] = [];
    const tur = o.toolUseResult;
    const teammate = !!tur && typeof tur === 'object' && tur.status === 'teammate_spawned';
    const async =
      teammate || (!!tur && typeof tur === 'object' && (tur.isAsync === true || tur.status === 'async_launched'));
    for (const c of content) {
      if (c?.type === 'tool_result') {
        if (teammate && (tur.agentId || tur.agent_id)) {
          out.push({
            k: 'teammate',
            ts,
            agent,
            toolUseId: String(c.tool_use_id),
            agentId: String(tur.agentId || tur.agent_id),
            name: String(tur.name ?? ''),
          });
        }
        const error = c.is_error === true;
        out.push({
          k: 'toolDone',
          ts,
          agent,
          id: String(c.tool_use_id),
          error,
          errText: error ? clip(toolResultText(c.content), 60) : undefined,
          async: async || undefined,
        });
      } else if (c?.type === 'text' && !isSub) {
        const text = clip(c.text, 60);
        if (text.includes('<task-notification>')) out.push(...notification(c.text, ts));
        else if (c.text.includes('<teammate-message')) out.push(...teammateIdle(c.text, ts));
        else if (text && !text.startsWith('<')) out.push({ k: 'prompt', ts, agent, text });
      }
    }
    return out;
  }

  return [];
}
