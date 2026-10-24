import fs from 'node:fs';
import path from 'node:path';
import type { Collision, FloorInfo } from '../shared/events.ts';

// 같은 파일을 둘 이상이 고치고 있으면 알린다. agent-tail의 Hub.recomputeConflicts를
// 한 대짜리로 옮긴 것: git 상태 대신 세션 기록의 Edit/Write 경로를 본다.

export const COLLISION_WINDOW_MS = 10 * 60_000;
const TAIL_BYTES = 256 * 1024;
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

export interface Edit {
  path: string;
  ts: number;
}

/** jsonl 조각에서 파일 수정 tool_use를 뽑는다. 잘린 첫 줄 같은 깨진 줄은 건너뛴다. */
export function editsFromText(text: string): Edit[] {
  const out: Edit[] = [];
  for (const line of text.split('\n')) {
    if (!line.includes('"tool_use"')) continue;
    let o: any;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (o?.type !== 'assistant' || !Array.isArray(o.message?.content)) continue;
    const ts = Date.parse(o.timestamp) || 0;
    for (const c of o.message.content) {
      if (c?.type !== 'tool_use' || !EDIT_TOOLS.has(c.name)) continue;
      const p = c.input?.file_path ?? c.input?.notebook_path;
      if (typeof p === 'string' && p) out.push({ path: path.resolve(p), ts });
    }
  }
  return out;
}

export interface Editor {
  dir: string;
  id: string;
  agent: string;
  edits: Edit[];
}

/**
 * 창 안에서 같은 경로를 고친 편집자를 묶는다. 다른 세션끼리, 또는 한 세션의 서로 다른
 * 서브에이전트끼리(병렬 작업)를 충돌로 본다. 메인이 자기 서브에이전트 결과를 손보는 건 뺀다.
 */
export function findCollisions(editors: Editor[], now: number, windowMs = COLLISION_WINDOW_MS): Collision[] {
  const byPath = new Map<string, Collision['editors']>();
  for (const e of editors) {
    const latest = new Map<string, number>();
    for (const ed of e.edits) {
      if (now - ed.ts > windowMs) continue;
      latest.set(ed.path, Math.max(latest.get(ed.path) ?? 0, ed.ts));
    }
    for (const [p, ts] of latest) {
      const list = byPath.get(p) ?? [];
      list.push({ dir: e.dir, id: e.id, agent: e.agent, ts });
      byPath.set(p, list);
    }
  }
  const out: Collision[] = [];
  for (const [p, list] of byPath) {
    const sessions = new Set(list.map((x) => `${x.dir}/${x.id}`));
    const subsBySession = new Map<string, number>();
    for (const x of list) {
      if (x.agent === 'main') continue;
      const k = `${x.dir}/${x.id}`;
      subsBySession.set(k, (subsBySession.get(k) ?? 0) + 1);
    }
    if (sessions.size < 2 && ![...subsBySession.values()].some((n) => n > 1)) continue;
    out.push({ path: p, editors: list.sort((a, b) => a.ts - b.ts) });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

interface Cached {
  mtime: number;
  agent: string;
  edits: Edit[];
}

function readTail(file: string, size: number): string {
  const start = Math.max(0, size - TAIL_BYTES);
  const buf = Buffer.alloc(size - start);
  const fd = fs.openSync(file, 'r');
  try {
    fs.readSync(fd, buf, 0, buf.length, start);
  } finally {
    fs.closeSync(fd);
  }
  return buf.toString('utf8');
}

/** 최근 세션(본 기록 + 서브에이전트)의 꼬리를 mtime이 바뀔 때만 다시 읽는다. */
export class CollisionTracker {
  private cache = new Map<string, Cached>();

  constructor(private sessionFile: (dir: string, id: string) => string) {}

  private load(file: string, agent: () => string, now: number): Cached | null {
    let st: fs.Stats;
    try {
      st = fs.statSync(file);
    } catch {
      this.cache.delete(file);
      return null;
    }
    if (now - st.mtimeMs > COLLISION_WINDOW_MS) return null;
    const hit = this.cache.get(file);
    if (hit && hit.mtime === st.mtimeMs) return hit;
    let edits: Edit[] = [];
    try {
      edits = editsFromText(readTail(file, st.size));
    } catch {
      // 읽다 사라진 파일은 다음 번에
    }
    // meta.json이 늦게 생기면 agent:<id>로 잡아 둔 키를 다시 확인한다
    const c = { mtime: st.mtimeMs, agent: hit && !hit.agent.startsWith('agent:') ? hit.agent : agent(), edits };
    this.cache.set(file, c);
    return c;
  }

  update(floors: FloorInfo[], now = Date.now()): Collision[] {
    const editors: Editor[] = [];
    const seen = new Set<string>();
    for (const f of floors) {
      for (const s of f.sessions) {
        if (now - s.mtime > COLLISION_WINDOW_MS) continue;
        const main = this.sessionFile(f.dir, s.id);
        seen.add(main);
        const m = this.load(main, () => 'main', now);
        if (m?.edits.length) editors.push({ dir: f.dir, id: s.id, agent: 'main', edits: m.edits });

        const subDir = path.join(path.dirname(main), s.id, 'subagents');
        let names: string[] = [];
        try {
          names = fs.readdirSync(subDir).filter((n) => n.endsWith('.jsonl'));
        } catch {
          // 서브에이전트가 없는 세션
        }
        for (const n of names) {
          const file = path.join(subDir, n);
          seen.add(file);
          const c = this.load(file, () => subagentKey(file, n), now);
          if (c?.edits.length) editors.push({ dir: f.dir, id: s.id, agent: c.agent, edits: c.edits });
        }
      }
    }
    for (const k of this.cache.keys()) if (!seen.has(k)) this.cache.delete(k);
    return findCollisions(editors, now);
  }
}

/** 화면의 서브에이전트 키와 같게: meta.json의 toolUseId, 없으면 agent:<id> */
function subagentKey(file: string, name: string): string {
  try {
    const meta = JSON.parse(fs.readFileSync(file.replace(/\.jsonl$/, '.meta.json'), 'utf8'));
    if (meta?.toolUseId) return String(meta.toolUseId);
  } catch {
    // meta가 아직 없을 수 있음
  }
  return `agent:${name.replace(/^agent-/, '').replace(/\.jsonl$/, '')}`;
}
