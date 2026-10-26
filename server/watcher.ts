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
  start: number;
  originator: string;
}

// Claude가 codex exec를 부른 뒤 Codex 기록이 시작될 때까지 기다려 주는 시간(권한 확인 포함)
const LINK_BEFORE_MS = 5000;
const LINK_AFTER_MS = 10 * 60_000;

const CODEX_DAY_DIRS = 7;

/** ~/.codex/sessions의 최근 rollout을 id → 파일·cwd·제목으로 색인한다. */
class CodexIndex {
  private byFile = new Map<string, CodexSession>();
  private byId = new Map<string, CodexSession>();
  // Claude 호출(tool_use id) ↔ 그 호출로 시작된 Codex 세션. 서버가 떠 있는 동안 유지한다.
  private links = new Map<string, string>();
  private linked = new Set<string>();
  // 층 스캐너가 Claude 기록에서 찾은, 아직 짝이 없는 codex 호출
  private pending = new Map<string, { ts: number; cwd: string; end?: number }>();

  /** Claude 기록에서 찾은 codex 호출을 올려 둔다. 다음 scan()에서 짝을 찾는다. */
  addHandoff(toolUseId: string, ts: number, cwd: string) {
    if (!this.links.has(toolUseId) && !this.pending.has(toolUseId)) this.pending.set(toolUseId, { ts, cwd });
  }

  /** 올려 둔 codex 호출이 끝났다. 그 뒤에 시작한 Codex 세션은 이 호출의 것이 아니다. */
  handoffDone(toolUseId: string, end: number) {
    const h = this.pending.get(toolUseId);
    if (h) h.end = end;
  }

  get(id: string): CodexSession | undefined {
    return this.byId.get(id);
  }

  isLinked(codexId: string): boolean {
    return this.linked.has(codexId);
  }

  /**
   * Claude의 codex 호출(toolUseId, ts, cwd)에 맞는 Codex 세션을 찾아 묶는다.
   * 호출 직후에 시작했고 아직 다른 호출에 묶이지 않은 세션 중 가장 이른 것. 같은 폴더를 먼저 고른다.
   * 사용자가 직접 연 대화형 세션(codex-tui)은 고르지 않는다.
   * 호출이 이미 끝났다면(end) 그 전에 시작한 세션만 본다. 바로 실패한 호출이 다음 호출의 세션을 가져가지 않게.
   */
  link(toolUseId: string, ts: number, cwd: string, end?: number): CodexSession | undefined {
    const known = this.links.get(toolUseId);
    if (known) return this.byId.get(known);
    const candidates = [...this.byId.values()]
      .filter((s) => !this.linked.has(s.id) && s.originator !== 'codex-tui')
      .filter((s) => s.start >= ts - LINK_BEFORE_MS && s.start <= Math.min(ts + LINK_AFTER_MS, end ?? Infinity))
      .sort((a, b) => Number(b.cwd === cwd) - Number(a.cwd === cwd) || a.start - b.start);
    const hit = candidates[0];
    if (!hit) return undefined;
    this.links.set(toolUseId, hit.id);
    this.linked.add(hit.id);
    return hit;
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
    let start = cached?.start ?? 0;
    let originator = cached?.originator ?? '';
    if (!cwd) {
      const top = readSlice(file, 0, Math.min(st.size, 64 * 1024)).toString('utf8');
      const nl = top.indexOf('\n');
      try {
        const meta = JSON.parse(nl < 0 ? top : top.slice(0, nl));
        if (meta?.type === 'session_meta') {
          id = String(meta.payload?.id ?? '');
          cwd = String(meta.payload?.cwd ?? '');
          start = Date.parse(meta.payload?.timestamp ?? meta.timestamp) || 0;
          originator = String(meta.payload?.originator ?? '');
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
    const s = { id, file, cwd, title, mtime: st.mtimeMs, size: st.size, start: start || st.birthtimeMs, originator };
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
    // 누가 그 Claude 세션을 보고 있지 않아도 묶어 둬야 Codex 매장이 따로 튀어나오지 않는다
    for (const [toolUseId, h] of [...this.pending].sort((a, b) => a[1].ts - b[1].ts)) {
      if (this.link(toolUseId, h.ts, h.cwd, h.end) || h.end !== undefined || now - h.ts > LINK_AFTER_MS) {
        this.pending.delete(toolUseId);
      }
    }
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
    if (tail.includes('codex')) {
      for (const l of tail.split('\n')) {
        if (!l.includes('"tool_use"') && !l.includes('"tool_result"')) continue;
        for (const e of parseLine(l)) {
          if (e.k === 'spawn' && e.subagentType === 'Codex') codexIndex.addHandoff(e.toolUseId, e.ts, h.cwd);
          // 백그라운드로 띄운 호출은 바로 결과가 오므로 끝으로 치지 않는다
          else if (e.k === 'toolDone' && !e.async) codexIndex.handoffDone(e.id, e.ts);
        }
      }
    }
    return h;
  }

  /** Codex 세션을 같은 작업 폴더의 층에 얹는다. 그런 층이 없으면 새 층을 만든다. */
  private mergeCodex(floors: FloorInfo[], now: number) {
    for (const cx of codexIndex.scan(now)) {
      // Claude의 서브에이전트로 묶인 세션은 그 Claude 매장 안에 보이므로 따로 내놓지 않는다
      if (codexIndex.isLinked(cx.id)) continue;
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
  // Claude가 codex exec로 맡긴 일: 아직 기록을 못 찾은 호출(toolUseId → 시작·끝)과 찾은 기록(파일 → toolUseId)
  private handoffs = new Map<string, { ts: number; end?: number }>();
  private codexFiles = new Map<string, string>();
  private cwd = '';

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

  /** 줄 하나를 이벤트로. 어느 파서를 쓸지 고르고, cwd와 Codex 호출을 기억해 둔다. */
  private parseFrom(file: string, line: string, agent: string): OfficeEvent[] {
    if (this.codexFiles.has(file)) return parseCodexLine(line, agent);
    if (!this.cwd && this.source === 'claude' && line.includes('"cwd"')) {
      try {
        this.cwd = String(JSON.parse(line).cwd ?? '');
      } catch {
        // 다음 줄에서 다시
      }
    }
    const events = this.parse(line, agent);
    for (const e of events) {
      if (e.k === 'spawn' && e.subagentType === 'Codex') this.handoffs.set(e.toolUseId, { ts: e.ts });
      else if (e.k === 'toolDone' && !e.async) {
        const h = this.handoffs.get(e.id);
        if (h) h.end = e.ts;
      }
    }
    return events;
  }

  /** 아직 못 찾은 Codex 호출의 기록을 찾아 붙인다 */
  private linkCodex() {
    for (const [toolUseId, h] of this.handoffs) {
      const cx = codexIndex.link(toolUseId, h.ts, this.cwd, h.end);
      // 끝났는데도 짝이 없으면 Codex가 뜨지 못한 호출이다
      if (cx) this.codexFiles.set(cx.file, toolUseId);
      if (cx || h.end !== undefined) this.handoffs.delete(toolUseId);
    }
  }

  /** 지금까지의 기록을 이벤트로 돌려주고, 이후 증가분을 따라가기 시작한다. */
  replay(): OfficeEvent[] {
    const events: OfficeEvent[] = [];
    const read = (file: string, agent: string) => {
      const st = statOrNull(file);
      if (!st) return;
      const start = Math.max(0, st.size - REPLAY_BYTES);
      const buf = readSlice(file, start, st.size);
      const cut = buf.lastIndexOf(0x0a);
      const lines = cut < 0 ? [] : buf.subarray(0, cut).toString('utf8').split('\n');
      if (start > 0) lines.shift();
      for (const l of lines) if (l.trim()) events.push(...this.parseFrom(file, l, agent));
      this.files.set(file, { offset: st.size, rest: Buffer.from(buf.subarray(cut + 1)), agent });
    };
    for (const [file, agent] of this.discover(true)) read(file, agent);
    // Codex 호출은 본 기록을 읽어야 알 수 있으므로 한 번 더
    this.linkCodex();
    for (const [file, agent] of this.codexFiles) if (!this.files.has(file)) read(file, agent);
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
    if (!initial) {
      this.linkCodex();
      out.push(...this.codexFiles);
    }
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
        if (l.trim()) events.push(...this.parseFrom(file, l, f.agent));
      }
    }
    if (events.length) {
      events.sort((a, b) => a.ts - b.ts);
      this.onEvents(events);
    }
  }
}
