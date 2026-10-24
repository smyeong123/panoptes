import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// watcher는 import할 때 폴더 경로를 정하므로 env를 먼저 맞추고 불러온다
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'panoptes-link-'));
const projects = path.join(root, 'projects');
const codexHome = path.join(root, 'codex');
const cwd = '/work/demo';
const dir = cwd.replace(/[^a-zA-Z0-9]/g, '-');
const t0 = Date.now() - 60_000;
const iso = (ms: number) => new Date(t0 + ms).toISOString();
let watcher: typeof import('../server/watcher.ts');

function rollout(name: string, id: string, startMs: number, originator: string) {
  const day = path.join(codexHome, 'sessions', '2026', '10', '24');
  fs.mkdirSync(day, { recursive: true });
  const lines = [
    { timestamp: iso(startMs), type: 'session_meta', payload: { id, cwd, timestamp: iso(startMs), originator } },
    {
      timestamp: iso(startMs + 1000),
      type: 'response_item',
      payload: { type: 'custom_tool_call', name: 'exec', call_id: `${id}-c1`, input: 'await tools.exec_command({cmd:"ls server"});' },
    },
  ];
  fs.writeFileSync(path.join(day, `rollout-${name}-${id}.jsonl`), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
}

beforeAll(async () => {
  process.env.CLAUDE_PROJECTS_DIR = projects;
  process.env.CODEX_HOME = codexHome;
  fs.mkdirSync(path.join(projects, dir), { recursive: true });
  const claude = [
    { type: 'user', cwd, timestamp: iso(0), message: { content: 'ask codex' } },
    {
      type: 'assistant',
      cwd,
      timestamp: iso(1000),
      message: { content: [{ type: 'tool_use', id: 'toolu_cx', name: 'Bash', input: { command: 'codex exec "list server"' } }] },
    },
  ];
  fs.writeFileSync(path.join(projects, dir, 's1.jsonl'), claude.map((l) => JSON.stringify(l)).join('\n') + '\n');
  // 직접 연 대화형 세션은 시간이 맞아도 묶이면 안 된다
  rollout('tui', '0199aaaa-0000-7000-8000-000000000001', 1500, 'codex-tui');
  rollout('exec', '0199aaaa-0000-7000-8000-000000000002', 3000, 'codex_exec');
  watcher = await import('../server/watcher.ts');
  watcher.codexIndex.scan(Date.now());
});

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe('Codex 서브에이전트 연결', () => {
  it('codex exec 호출 뒤에 시작한 exec 세션을 그 호출의 서브에이전트로 붙인다', () => {
    const events = new watcher.SessionTail(`${dir}/s1`, () => {}).replay();
    expect(events.find((e) => e.k === 'spawn')).toMatchObject({ toolUseId: 'toolu_cx', subagentType: 'Codex' });
    expect(events.find((e) => e.k === 'tool' && e.agent === 'toolu_cx')).toMatchObject({ room: 'server', label: 'ls server' });
    expect(watcher.codexIndex.isLinked('0199aaaa-0000-7000-8000-000000000002')).toBe(true);
    expect(watcher.codexIndex.isLinked('0199aaaa-0000-7000-8000-000000000001')).toBe(false);
  });

  it('새 클라이언트가 다시 재생해도 같은 세션에 붙는다', () => {
    const events = new watcher.SessionTail(`${dir}/s1`, () => {}).replay();
    expect(events.filter((e) => e.k === 'tool' && e.agent === 'toolu_cx')).toHaveLength(1);
  });

  it('층 스캐너가 보는 사람 없이도 묶고, 묶인 Codex 세션은 매장 목록에서 뺀다', () => {
    const stores: { id: string; source?: string }[] = [];
    const scanner = new watcher.FloorScanner(() => {});
    scanner.scan();
    for (const f of scanner.floors) stores.push(...f.sessions);
    expect(stores.map((s) => s.id)).toContain('s1');
    expect(stores.map((s) => s.id)).toContain('0199aaaa-0000-7000-8000-000000000001');
    expect(stores.map((s) => s.id)).not.toContain('0199aaaa-0000-7000-8000-000000000002');
  });
});
