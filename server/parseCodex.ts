import type { OfficeEvent } from '../shared/events.ts';
import { roomForTool } from '../shared/rooms.ts';
import { basename, clip, isGit } from './parse.ts';

// Codex CLI 기록(~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl)을 사무실 이벤트로 바꾼다.
// 줄 모양: { timestamp, type: 'session_meta' | 'response_item' | 'event_msg' | ..., payload }.
// 공개된 형식이 아니라 버전마다 바뀌므로 모르는 줄은 건너뛴다. agent-tail의 codex 어댑터를 참고했다.

/** apply_patch 본문의 *** Update/Add/Delete File: 경로들 */
export function patchFiles(text: string): string[] {
  return [...text.matchAll(/\*\*\* (?:Update|Add|Delete) File: ([^\n\\]+)/g)].map((m) => m[1].trim()).filter(Boolean);
}

function stripShellWrapper(cmd: string): string {
  return cmd.replace(/^(bash|zsh|sh)\s+-l?c\s+/, '').replace(/^(['"])([\s\S]*)\1$/, '$2');
}

function commandOf(args: any): string | undefined {
  const c = args?.command ?? args?.cmd;
  if (Array.isArray(c)) return c.join(' ');
  return typeof c === 'string' ? c : undefined;
}

/** 실제 사용자 입력만. content_item_kinds가 있으면 user.text만 고르고, 없으면 주입 문구를 걸러 낸다. */
function userText(p: any): string {
  const content: any[] = Array.isArray(p.content) ? p.content : [];
  const kinds = p.internal_chat_message_metadata_passthrough?.content_item_kinds;
  const picked = Array.isArray(kinds)
    ? content.filter((_, i) => kinds[i] === 'user.text')
    : content.filter((c) => !/^\s*(<|# AGENTS\.md)/.test(String(c?.text ?? '')));
  return picked.map((c) => c?.text ?? '').join(' ');
}

// codex-cli 0.16x는 명령을 'exec' 스크립트 도구로 돌린다:
//   const r = await tools.exec_command({cmd:"git status", workdir:"…"}); text(r.output);
const SCRIPT_CALL_RE = /tools\.(\w+)\(\s*\{([\s\S]*?)\}\s*\)/g;
const CMD_RE = /\bcmd\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`[^`]*`)/;

function unquote(s: string): string {
  if (s.startsWith('"')) {
    try {
      return JSON.parse(s);
    } catch {
      // 아래에서 따옴표만 벗긴다
    }
  }
  return s.slice(1, -1);
}

/** exec 스크립트 안의 도구 호출들. 첫 호출로 방을 정하고, 더 있으면 라벨에 (+n)을 붙인다. */
function scriptTool(ts: number, agent: string, id: string, input: string): OfficeEvent {
  const calls = [...input.matchAll(SCRIPT_CALL_RE)];
  const extra = calls.length > 1 ? ` (+${calls.length - 1})` : '';
  const first = calls[0];
  if (!first) return { k: 'tool', ts, agent, id, name: 'exec', room: 'server', label: clip(input, 60) };
  const cmd = CMD_RE.exec(first[2]);
  if (/^(exec_command|shell|local_shell)$/.test(first[1]) && cmd) {
    const ev = shellTool(ts, agent, id, unquote(cmd[1]));
    return extra && ev.k === 'tool' ? { ...ev, label: clip(ev.label + extra, 60) } : ev;
  }
  const name = first[1];
  return { k: 'tool', ts, agent, id, name, room: roomForTool(name), label: clip(name + extra, 40) };
}

function shellTool(ts: number, agent: string, id: string, cmd: string): OfficeEvent {
  const bare = stripShellWrapper(cmd);
  return { k: 'tool', ts, agent, id, name: 'Bash', room: 'server', label: clip(bare, 60), git: isGit('Bash', { command: bare }) || undefined };
}

function patchTool(ts: number, agent: string, id: string, text: string): OfficeEvent {
  const files = patchFiles(text).map(basename);
  return { k: 'tool', ts, agent, id, name: 'Edit', room: 'dev', label: clip(files.join(', ') || 'patch', 40) };
}

function outputError(raw: unknown): { error: boolean; text: string } {
  // exec 도구의 출력은 [{type:'input_text', text}, …] 배열로 온다
  if (Array.isArray(raw)) raw = raw.map((c: any) => (typeof c?.text === 'string' ? c.text : '')).join('\n');
  let text = typeof raw === 'string' ? raw : JSON.stringify(raw ?? '');
  let code: number | undefined;
  try {
    const o = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (o && typeof o === 'object') {
      if (typeof o.output === 'string') text = o.output;
      if (typeof o.metadata?.exit_code === 'number') code = o.metadata.exit_code;
    }
  } catch {
    // 평문 출력
  }
  if (code === undefined) {
    const m = /(?:Process exited with code|Exit code:?|exit_code"?:)\s*(\d+)/i.exec(text);
    if (m) code = Number(m[1]);
  }
  const failed = /^Script (?:failed|error)/im.test(text);
  // 머리말(Script completed / Wall time / Output:)은 빼고 본문을 에러 문구로
  const body = text.replace(/^(Script \w+|Wall time [^\n]*|Output:)\s*$/gim, '').trim();
  return { error: failed || (code !== undefined && code !== 0), text: body || text };
}

export function parseCodexLine(line: string, agent = 'main'): OfficeEvent[] {
  let o: any;
  try {
    o = JSON.parse(line);
  } catch {
    return [];
  }
  if (!o || typeof o !== 'object') return [];
  const ts = Date.parse(o.timestamp) || Date.now();

  if (o.type === 'event_msg') {
    return o.payload?.type === 'task_complete' ? [{ k: 'turnEnd', ts, agent }] : [];
  }
  // 아주 옛 형식은 감싸는 payload 없이 항목이 바로 온다
  const p = o.type === 'response_item' ? o.payload : o.payload === undefined ? o : null;
  if (!p || typeof p !== 'object') return [];

  switch (p.type) {
    case 'message': {
      if (p.role === 'user') {
        const text = clip(userText(p), 60);
        return text ? [{ k: 'prompt', ts, agent, text }] : [];
      }
      if (p.role === 'assistant') {
        const text = clip((Array.isArray(p.content) ? p.content : []).map((c: any) => c?.text ?? '').join(' '), 70);
        return text ? [{ k: 'say', ts, agent, text }] : [];
      }
      return [];
    }
    case 'reasoning': {
      const summary = (Array.isArray(p.summary) ? p.summary : []).map((s: any) => s?.text ?? '').join(' ');
      return [{ k: 'think', ts, agent, text: clip(summary, 90) }];
    }
    case 'function_call': {
      const id = String(p.call_id ?? p.id);
      let args: any = p.arguments;
      try {
        args = typeof args === 'string' ? JSON.parse(args) : args;
      } catch {
        // 문자열 그대로
      }
      const raw = typeof args === 'string' ? args : JSON.stringify(args ?? {});
      if (raw.includes('*** Begin Patch')) return [patchTool(ts, agent, id, typeof args?.input === 'string' ? args.input : raw)];
      const cmd = commandOf(args);
      if (cmd) return [shellTool(ts, agent, id, cmd)];
      const name = String(p.name ?? 'tool');
      return [{ k: 'tool', ts, agent, id, name, room: roomForTool(name), label: name.startsWith('mcp__') ? name.split('__').slice(1).join(' · ') : clip(name, 40) }];
    }
    case 'local_shell_call':
      return [shellTool(ts, agent, String(p.call_id ?? p.id), commandOf(p.action) ?? '')];
    case 'custom_tool_call': {
      const id = String(p.call_id ?? p.id);
      const input = String(p.input ?? '');
      if (p.name === 'apply_patch' || input.includes('*** Begin Patch')) return [patchTool(ts, agent, id, input)];
      if (p.name === 'exec' || input.includes('tools.')) return [scriptTool(ts, agent, id, input)];
      const name = String(p.name ?? 'tool');
      return [{ k: 'tool', ts, agent, id, name, room: roomForTool(name), label: clip(name, 40) }];
    }
    case 'web_search_call': {
      // 결과 줄이 따로 없으므로 바로 끝낸다
      const id = String(p.id ?? p.call_id ?? ts);
      return [
        { k: 'tool', ts, agent, id, name: 'WebSearch', room: 'search', label: clip(p.action?.query ?? '', 50) },
        { k: 'toolDone', ts, agent, id, error: false },
      ];
    }
    case 'function_call_output':
    case 'custom_tool_call_output':
    case 'local_shell_call_output': {
      const { error, text } = outputError(p.output);
      return [{ k: 'toolDone', ts, agent, id: String(p.call_id ?? p.id), error, errText: error ? clip(text, 60) : undefined }];
    }
  }
  return [];
}
