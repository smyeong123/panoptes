import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FloorInfo, OfficeEvent, SessionInfo } from '../shared/events.ts';
import { parseLine } from './parse.ts';

export const PROJECTS_DIR = process.env.CLAUDE_PROJECTS_DIR || path.join(os.homedir(), '.claude', 'projects');

const SCAN_MS = 1000;
const TAIL_MS = 250;
const RECENT_MS = 24 * 3600_000;
const REPLAY_BYTES = 8 * 1024 * 1024;
const REPLAY_MAX_EVENTS = 4000;
const META_WAIT_MS = 3000;

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

/** 프로젝트 폴더 = 층, 세션 jsonl = 매장. */
export class FloorScanner {
  private heads = new Map<string, FileHead>();
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
    const h = { mtime: st.mtimeMs, title: unescapeJson(title), cwd: unescapeJson(cwd) };
    this.heads.set(file, h);
    return h;
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
      floors.push({
        dir,
        name: cwd ? path.basename(cwd) || cwd : dir,
        cwd,
        mtime: all[0].mtime,
        sessions,
      });
    }
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

  constructor(
    readonly key: string,
    private onEvents: (events: OfficeEvent[]) => void,
  ) {
    const [dir, id] = key.split('/');
    this.mainFile = path.join(PROJECTS_DIR, dir, `${id}.jsonl`);
    this.subDir = path.join(PROJECTS_DIR, dir, id, 'subagents');
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
      for (const l of lines) if (l.trim()) events.push(...parseLine(l, agent));
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
        if (l.trim()) events.push(...parseLine(l, f.agent));
      }
    }
    if (events.length) {
      events.sort((a, b) => a.ts - b.ts);
      this.onEvents(events);
    }
  }
}
