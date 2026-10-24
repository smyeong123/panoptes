import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FloorInfo, GitInfo, OfficeEvent, SessionInfo, SessionSource } from '../shared/events.ts';
import { gitSnapshot } from './git.ts';
import { parseLine } from './parse.ts';
import { parseCodexLine } from './parseCodex.ts';
import { redact } from './redact.ts';

export const PROJECTS_DIR = process.env.CLAUDE_PROJECTS_DIR || path.join(os.homedir(), '.claude', 'projects');
export const CODEX_SESSIONS_DIR = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'sessions');

/** Claude Code가 프로젝트 폴더 이름을 만드는 방식. Codex 세션도 같은 층에 올리려고 따라 한다. */
export function encodeCwd(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-');
}

const SCAN_MS = 1000;
const TAIL_MS = 250;
const RECENT_MS = 24 * 3600_000;
const REPLAY_BYTES = 8 * 1024 * 1024;
const REPLAY_MAX_EVENTS = 4000;
const META_WAIT_MS = 3000;
const GIT_ACTIVE_MS = 5000;
const GIT_IDLE_MS = 60_000;
const LIVE_MS = 15_000;

function readSlice(file: string, start: number, end: number): Buffer {
  const len = Math.max(0, end - start);
  const buf = Buffer.alloc(len);
  if (!len) return buf;
  const fd = fs.openSync(file, 'r');
  try {
    let read = 0;
    while (read < len) {
      const n = fs.readSync(fd, buf, read, len - read, start + read);
      if (n <= 0) break;
      read += n;
    }
    return buf.subarray(0, read);
  } finally {
    fs.closeSync(fd);
  }
}

function statOrNull(p: string): fs.Stats | null {
  try {
    return fs.statSync(p);
  } catch {
    return null;
  }
}

function lastMatch(text: string, re: RegExp): string | undefined {
  let m: RegExpExecArray | null;
  let last: string | undefined;
  re.lastIndex = 0;
  while ((m = re.exec(text))) last = m[1];
  return last;
}

function unescapeJson(s: string): string {
  try {
    return JSON.parse(`"${s}"`);
  } catch {
    return s;
  }
}

interface FileHead {
  mtime: number;
  title: string;
  cwd: string;
}

interface GitEntry {
  info: GitInfo | null;
  at: number;
  json: string;
}

/** 층마다 작업 폴더의 git 상태를 캐시한다. 한 번에 하나씩만 돌려서 scan()을 막지 않는다. */
class GitPoller {
  private cache = new Map<string, GitEntry>();
  private busy = false;

  constructor(private onChange: () => void) {}

  get(cwd: string): GitInfo | undefined {
    return this.cache.get(cwd)?.info ?? undefined;
  }

  /** 활동 중인 층은 5초, 아닌 층은 60초마다 새로 읽는다 */
  refresh(targets: { cwd: string; live: boolean }[]) {
    if (this.busy) return;
    const now = Date.now();
    const due = targets.filter((t) => {
      if (!t.cwd) return false;
      const e = this.cache.get(t.cwd);
      return !e || now - e.at >= (t.live ? GIT_ACTIVE_MS : GIT_IDLE_MS);
    });
    if (!due.length) return;
    this.busy = true;
    void (async () => {
      let changed = false;
      for (const { cwd } of due) {
        const info = await gitSnapshot(cwd).catch(() => null);
        const json = JSON.stringify(info);
        if (this.cache.get(cwd)?.json !== json) changed = true;
        this.cache.set(cwd, { info, at: Date.now(), json });
      }
      this.busy = false;
      if (changed) this.onChange();
    })();
  }
}

interface CodexSession {
  id: string;
  file: string;
  cwd: string;
  title: string;
  mtime: number;
  size: number;
}

const CODEX_DAY_DIRS = 7;

/** ~/.codex/sessions의 최근 rollout을 id → 파일·cwd·제목으로 색인한다. */
class CodexIndex {
  private byFile = new Map<string, CodexSession>();
  private byId = new Map<string, CodexSession>();

  get(id: string): CodexSession | undefined {
    return this.byId.get(id);
  }

  /** 최근 며칠치 날짜 폴더만 본다. 오래 열린 세션도 시작한 날짜 폴더에 계속 쓰므로 하루치로는 모자라다. */
  private dayDirs(): string[] {
    const out: string[] = [];
    const desc = (d: string) => {
      try {
        return fs.readdirSync(d).filter((n) => /^\d+$/.test(n)).sort().reverse();
      } catch {
        return [];
      }
    };
    for (const y of desc(CODEX_SESSIONS_DIR)) {
      for (const m of desc(path.join(CODEX_SESSIONS_DIR, y))) {
        for (const d of desc(path.join(CODEX_SESSIONS_DIR, y, m))) {
          out.push(path.join(CODEX_SESSIONS_DIR, y, m, d));
          if (out.length >= CODEX_DAY_DIRS) return out;
        }
      }
    }
    return out;
  }

  private read(file: string, st: fs.Stats): CodexSession | null {
    const cached = this.byFile.get(file);
    if (cached && cached.mtime === st.mtimeMs) return cached;
    let id = cached?.id ?? '';
    let cwd = cached?.cwd ?? '';
    if (!cwd) {
      const top = readSlice(file, 0, Math.min(st.size, 64 * 1024)).toString('utf8');
      const nl = top.indexOf('\n');
      try {
        const meta = JSON.parse(nl < 0 ? top : top.slice(0, nl));
        if (meta?.type === 'session_meta') {
          id = String(meta.payload?.id ?? '');
          cwd = String(meta.payload?.cwd ?? '');
        }
      } catch {
        // 첫 줄이 아직 덜 써졌을 수 있음
      }
    }
    if (!id) id = /([0-9a-f]{8}-[0-9a-f-]{27,})\.jsonl$/i.exec(file)?.[1] ?? '';
    if (!id || !cwd) return null;
    // 제목: 마지막 실제 사용자 입력
    let title = cached?.title ?? '';
    const tail = readSlice(file, Math.max(0, st.size - 256 * 1024), st.size).toString('utf8');
    for (const l of tail.split('\n').reverse()) {
      if (!/"role":\s*"user"/.test(l)) continue;
      const ev = parseCodexLine(l).find((e) => e.k === 'prompt');
      if (ev && ev.k === 'prompt') {
        title = ev.text;
        break;
      }
    }
    const s = { id, file, cwd, title, mtime: st.mtimeMs, size: st.size };
    this.byFile.set(file, s);
    return s;
  }

  scan(now: number): CodexSession[] {
    const out: CodexSession[] = [];
    const seen = new Set<string>();
    for (const dir of this.dayDirs()) {
      let names: string[];
      try {
        names = fs.readdirSync(dir).filter((n) => n.startsWith('rollout-') && n.endsWith('.jsonl'));
      } catch {
        continue;
      }
      for (const n of names) {
        const file = path.join(dir, n);
        const st = statOrNull(file);
        if (!st || !st.size || now - st.mtimeMs >= RECENT_MS) continue;
        const s = this.read(file, st);
        if (!s) continue;
        seen.add(file);
        out.push(s);
      }
    }
    for (const f of this.byFile.keys()) if (!seen.has(f)) this.byFile.delete(f);
    this.byId = new Map(out.map((s) => [s.id, s]));
    return out;
  }
}

export const codexIndex = new CodexIndex();

/** 세션 본 기록 경로. Codex 세션이면 rollout 파일. */
export function sessionFile(dir: string, id: string): string {
  return codexIndex.get(id)?.file ?? path.join(PROJECTS_DIR, dir, `${id}.jsonl`);
}

/** 프로젝트 폴더 = 층, 세션 jsonl = 매장. */
export class FloorScanner {
  private heads = new Map<string, FileHead>();
  private git = new GitPoller(() => this.scan());
  floors: FloorInfo[] = [];
  private timer?: NodeJS.Timeout;
  private lastJson = '';

  constructor(private onChange: (floors: FloorInfo[]) => void) {}

  start() {
    this.scan();
    this.timer = setInterval(() => this.scan(), SCAN_MS);
  }

  stop() {
    clearInterval(this.timer);
  }

  private head(file: string, st: fs.Stats): FileHead {
    const cached = this.heads.get(file);
    if (cached && cached.mtime === st.mtimeMs) return cached;
    const tail = readSlice(file, Math.max(0, st.size - 256 * 1024), st.size).toString('utf8');
    let title =
      lastMatch(tail, /"type":"ai-title","aiTitle":"((?:[^"\\]|\\.)*)"/g) ??
      lastMatch(tail, /"type":"last-prompt","lastPrompt":"((?:[^"\\]|\\.)*)"/g) ??
      cached?.title ??
      '';
    let cwd = cached?.cwd ?? '';
    if (!cwd) {
      const top = readSlice(file, 0, Math.min(st.size, 128 * 1024)).toString('utf8');
      cwd = lastMatch(top, /"cwd":"((?:[^"\\]|\\.)*)"/g) ?? lastMatch(tail, /"cwd":"((?:[^"\\]|\\.)*)"/g) ?? '';
    }
    const h = { mtime: st.mtimeMs, title: redact(unescapeJson(title)), cwd: unescapeJson(cwd) };
    this.heads.set(file, h);
    return h;
  }

  /** Codex 세션을 같은 작업 폴더의 층에 얹는다. 그런 층이 없으면 새 층을 만든다. */
  private mergeCodex(floors: FloorInfo[], now: number) {
    for (const cx of codexIndex.scan(now)) {
      const dir = encodeCwd(cx.cwd);
      let f = floors.find((x) => x.dir === dir);
      if (!f) {
        const git = this.git.get(cx.cwd);
        f = { dir, name: path.basename(cx.cwd) || cx.cwd, cwd: cx.cwd, mtime: 0, sessions: [], ...(git ? { git } : {}) };
        floors.push(f);
      }
      f.sessions.push({ id: cx.id, title: cx.title, mtime: cx.mtime, size: cx.size, source: 'codex' });
      f.sessions.sort((a, b) => b.mtime - a.mtime);
      f.mtime = Math.max(f.mtime, cx.mtime);
    }
  }

  scan() {
    let dirs: string[];
    try {
      dirs = fs.readdirSync(PROJECTS_DIR);
    } catch {
      dirs = [];
    }
    const now = Date.now();
    const floors: FloorInfo[] = [];
    for (const dir of dirs) {
      const full = path.join(PROJECTS_DIR, dir);
      let names: string[];
      try {
        names = fs.readdirSync(full).filter((n) => n.endsWith('.jsonl'));
      } catch {
        continue;
      }
      const all: (SessionInfo & { cwd: string })[] = [];
      for (const n of names) {
        const file = path.join(full, n);
        const st = statOrNull(file);
        if (!st || !st.size) continue;
        const h = this.head(file, st);
        all.push({ id: n.slice(0, -6), title: h.title, mtime: st.mtimeMs, size: st.size, cwd: h.cwd });
      }
      if (!all.length) continue;
      all.sort((a, b) => b.mtime - a.mtime);
      const recent = all.filter((s) => now - s.mtime < RECENT_MS);
      const sessions = (recent.length ? recent : all.slice(0, 3)).map(({ cwd: _cwd, ...s }) => s);
      const cwd = all.find((s) => s.cwd)?.cwd ?? '';
      const git = this.git.get(cwd);
      floors.push({
        dir,
        name: cwd ? path.basename(cwd) || cwd : dir,
        cwd,
        mtime: all[0].mtime,
        sessions,
        ...(git ? { git } : {}),
      });
    }
    this.mergeCodex(floors, now);
    this.git.refresh(floors.map((f) => ({ cwd: f.cwd, live: now - f.mtime < LIVE_MS })));
    this.floors = floors;
    const json = JSON.stringify(floors);
    if (json !== this.lastJson) {
      this.lastJson = json;
      this.onChange(floors);
    }
  }
}

interface TailFile {
  offset: number;
  rest: Buffer;
  agent: string;
}

/** 세션 하나(본 기록 + subagents/*.jsonl)를 250ms마다 따라 읽는다. */
export class SessionTail {
  private files = new Map<string, TailFile>();
  private pendingSince = new Map<string, number>();
  private timer?: NodeJS.Timeout;
  readonly mainFile: string;
  readonly subDir: string;
  readonly source: SessionSource;
  private parse: (line: string, agent: string) => OfficeEvent[];

  constructor(
    readonly key: string,
    private onEvents: (events: OfficeEvent[]) => void,
  ) {
    const [dir, id] = key.split('/');
    const cx = codexIndex.get(id);
    this.source = cx ? 'codex' : 'claude';
    this.mainFile = cx ? cx.file : path.join(PROJECTS_DIR, dir, `${id}.jsonl`);
    // Codex는 서브에이전트 기록을 따로 남기지 않는다
    this.subDir = cx ? '' : path.join(PROJECTS_DIR, dir, id, 'subagents');
    this.parse = cx ? parseCodexLine : parseLine;
  }

  static valid(key: string): boolean {
    const parts = key.split('/');
    return parts.length === 2 && parts.every((p) => p && !p.includes('..') && !/[\\:]/.test(p));
  }

  /** 지금까지의 기록을 이벤트로 돌려주고, 이후 증가분을 따라가기 시작한다. */
  replay(): OfficeEvent[] {
    const events: OfficeEvent[] = [];
    for (const [file, agent] of this.discover(true)) {
      const st = statOrNull(file);
      if (!st) continue;
      const start = Math.max(0, st.size - REPLAY_BYTES);
      const buf = readSlice(file, start, st.size);
      const cut = buf.lastIndexOf(0x0a);
      const lines = cut < 0 ? [] : buf.subarray(0, cut).toString('utf8').split('\n');
      if (start > 0) lines.shift();
      for (const l of lines) if (l.trim()) events.push(...this.parse(l, agent));
      this.files.set(file, { offset: st.size, rest: Buffer.from(buf.subarray(cut + 1)), agent });
    }
    events.sort((a, b) => a.ts - b.ts);
    return events.slice(-REPLAY_MAX_EVENTS);
  }

  start() {
    this.timer = setInterval(() => this.poll(), TAIL_MS);
  }

  stop() {
    clearInterval(this.timer);
  }

  /** [파일, 에이전트 키] 목록. 서브에이전트 키는 meta.json의 toolUseId. */
  private discover(initial: boolean): [string, string][] {
    const out: [string, string][] = [[this.mainFile, 'main']];
    if (!this.subDir) return out;
    let names: string[] = [];
    try {
      names = fs.readdirSync(this.subDir).filter((n) => n.endsWith('.jsonl'));
    } catch {
      return out;
    }
    for (const n of names) {
      const file = path.join(this.subDir, n);
      const known = this.files.get(file);
      if (known) {
        out.push([file, known.agent]);
        continue;
      }
      const agentId = n.replace(/^agent-/, '').replace(/\.jsonl$/, '');
      let agent: string | undefined;
      try {
        const meta = JSON.parse(fs.readFileSync(file.replace(/\.jsonl$/, '.meta.json'), 'utf8'));
        if (meta?.toolUseId) agent = String(meta.toolUseId);
      } catch {
        // meta가 아직 안 생겼을 수 있음
      }
      if (!agent) {
        const first = this.pendingSince.get(file) ?? Date.now();
        this.pendingSince.set(file, first);
        if (!initial && Date.now() - first < META_WAIT_MS) continue;
        agent = `agent:${agentId}`;
      }
      out.push([file, agent]);
    }
    return out;
  }

  private poll() {
    const events: OfficeEvent[] = [];
    for (const [file, agent] of this.discover(false)) {
      const st = statOrNull(file);
      if (!st) continue;
      let f = this.files.get(file);
      if (!f) {
        // 새로 생긴 서브에이전트 파일은 처음부터 읽는다
        f = { offset: 0, rest: Buffer.alloc(0), agent };
        this.files.set(file, f);
      }
      if (st.size < f.offset) {
        f.offset = 0;
        f.rest = Buffer.alloc(0);
      }
      if (st.size === f.offset) continue;
      const chunk = Buffer.concat([f.rest, readSlice(file, f.offset, st.size)]);
      f.offset = st.size;
      const cut = chunk.lastIndexOf(0x0a);
      if (cut < 0) {
        f.rest = chunk;
        continue;
      }
      f.rest = chunk.subarray(cut + 1);
      for (const l of chunk.subarray(0, cut).toString('utf8').split('\n')) {
        if (l.trim()) events.push(...this.parse(l, f.agent));
      }
    }
    if (events.length) {
      events.sort((a, b) => a.ts - b.ts);
      this.onEvents(events);
    }
  }
}
