import type { OfficeEvent, Room } from '../../shared/events.ts';
import { t } from '../i18n.ts';
import { ELEVATOR, ELEVATOR_OUT, rounded, route, SPOTS, spotFor, type Pt } from '../layout.ts';

export type Phase = 'arriving' | 'working' | 'reporting' | 'leaving' | 'gone';
export type Pose = 'walk' | 'idle' | 'read' | 'type' | 'operate' | 'write' | 'ask' | 'phone' | 'think' | 'report' | 'wave';
export type BubbleKind = 'think' | 'say' | 'error' | 'bye' | 'ask' | 'report' | 'phone';

export interface Activity {
  room: Room;
  kind: 'tool' | 'idle' | 'phone';
  toolId?: string;
  name?: string;
  label: string;
  git?: boolean;
  done: boolean;
}

export interface Bubble {
  kind: BubbleKind;
  text: string;
  until: number;
}

export interface Agent {
  key: string;
  role: 'main' | 'sub';
  type: string;
  description: string;
  slot: number;
  phase: Phase;
  pos: Pt;
  path: Pt[];
  /** 지금 걷는 속도 (타일/초). 서서히 붙고 서서히 멈춘다 */
  speed: number;
  /** 사람마다 조금씩 다른 걸음 빠르기 */
  pace: number;
  /** 서로 부딪히지 않게 비켜선 거리. 그릴 때만 더한다 */
  off: Pt;
  /** 엘리베이터에서 한 명씩 내리도록 출발을 늦춘다 */
  departAt: number;
  arrivedAt: number;
  queue: Activity[];
  cur: Activity | null;
  bubble: Bubble | null;
  sweatUntil: number;
  thinkUntil: number;
  lastEventAt: number;
  turnEndAt: number;
  doneAt: number;
  reportAt: number;
  goneAt: number;
}

/** 서버가 비워 보낸 라벨(질문·계획 검토)은 화면 언어로 채운다 */
function fallbackLabel(name: string): string {
  if (name === 'AskUserQuestion') return t('ask.question');
  if (name === 'ExitPlanMode') return t('ask.plan');
  return '';
}

const SPEED = 4.6; // 타일/초, 일이 밀리면 뛴다
const ACCEL = 14; // 타일/초²
const DECEL = 10;
/** 이보다 가까우면 서로 비켜선다 */
const PERSONAL = 0.8;
const MAX_OFF = 0.45;
const DEPART_GAP = 550;
/** 걸을 때 오른쪽으로 붙는 정도 (마주 오는 사람과 자연스럽게 엇갈린다) */
const KEEP_RIGHT = 0.36;
/** 앞사람과 이 거리 안이면 속도를 맞춘다 */
const FOLLOW = 1.1;
const MIN_DWELL = 800;
const MAX_BACKLOG = 4;
const SUB_IDLE_DONE_MS = 25_000;
const POSE_BY_ROOM: Record<Room, Pose> = {
  library: 'read',
  dev: 'type',
  server: 'operate',
  search: 'type',
  meeting: 'write',
  user: 'ask',
  desk: 'type',
};

export class Office {
  agents = new Map<string, Agent>();
  board: string[] = [];
  userBubble: Bubble | null = null;
  elevatorOpenUntil = 0;
  elevatorMoving = 0;
  private spawnIds = new Set<string>();
  private nextSlot = 1;
  private lastDepart = 0;

  constructor() {
    this.reset();
  }

  reset() {
    this.agents.clear();
    this.spawnIds.clear();
    this.board = [];
    this.userBubble = null;
    this.nextSlot = 1;
    const desk = spotFor('desk', 0);
    this.agents.set('main', this.makeAgent('main', 'main', 'claude', 'Claude', 0, { ...desk }));
    this.main.cur = { room: 'desk', kind: 'idle', label: '', done: true };
  }

  get main(): Agent {
    return this.agents.get('main')!;
  }

  private makeAgent(key: string, role: Agent['role'], type: string, description: string, slot: number, pos: Pt): Agent {
    return {
      key,
      role,
      type,
      description,
      slot,
      phase: 'working',
      pos,
      path: [],
      speed: 0,
      pace: 0.92 + ((slot * 37) % 17) / 100,
      off: { x: 0, y: 0 },
      departAt: 0,
      arrivedAt: 0,
      queue: [],
      cur: null,
      bubble: null,
      sweatUntil: 0,
      thinkUntil: 0,
      lastEventAt: 0,
      turnEndAt: 0,
      doneAt: 0,
      reportAt: 0,
      goneAt: 0,
    };
  }

  private spawnSub(key: string, type: string, description: string, now: number): Agent {
    const a = this.makeAgent(key, 'sub', type, description, this.nextSlot++, { ...ELEVATOR });
    a.phase = 'arriving';
    a.path = [{ ...ELEVATOR_OUT }];
    a.lastEventAt = now;
    this.queueDeparture(a, now);
    this.agents.set(key, a);
    return a;
  }

  /** 여럿이 한꺼번에 오면 엘리베이터에서 차례로 내린다 */
  private queueDeparture(a: Agent, now: number) {
    a.departAt = Math.max(now, this.lastDepart + DEPART_GAP);
    this.lastDepart = a.departAt;
    this.elevatorMoving = now;
    this.elevatorOpenUntil = Math.max(this.elevatorOpenUntil, a.departAt + 1600);
  }

  /** 엘리베이터 안에서 차례를 기다리는 중 (아직 안 보인다) */
  waiting(a: Agent, now: number): boolean {
    return a.phase === 'arriving' && now < a.departAt;
  }

  private openElevator(now: number) {
    this.elevatorMoving = now;
    this.elevatorOpenUntil = now + 1600;
  }

  private agentFor(key: string, now: number): Agent {
    let a = this.agents.get(key);
    if (!a) a = this.spawnSub(key, 'general-purpose', '', now);
    return a;
  }

  private say(a: Agent, kind: BubbleKind, text: string, until: number) {
    a.bubble = { kind, text, until };
  }

  /** 끝난 서브에이전트가 일을 또 받으면 다시 일하러 돌아간다 */
  private backToWork(a: Agent, now: number) {
    if (a.role !== 'sub') return;
    if (a.phase === 'gone') {
      a.pos = { ...ELEVATOR };
      a.path = [{ ...ELEVATOR_OUT }];
      a.speed = 0;
      a.goneAt = 0;
      this.queueDeparture(a, now);
      a.phase = 'arriving';
    } else if (a.phase === 'reporting' || a.phase === 'leaving') {
      a.phase = 'working';
      a.path = [];
      this.say(a, 'say', t('bubble.oneMore'), now + 1800);
    }
    a.doneAt = 0;
    a.reportAt = 0;
  }

  apply(ev: OfficeEvent, now: number) {
    const a = ev.k === 'agentDone' ? this.agents.get(ev.toolUseId) : this.agentFor(ev.agent, now);
    if (a) a.lastEventAt = now;
    switch (ev.k) {
      case 'tool': {
        if (!a) return;
        this.backToWork(a, now);
        a.queue.push({
          room: ev.room,
          kind: ev.name === 'Agent' || ev.name === 'Task' ? 'phone' : 'tool',
          toolId: ev.id,
          name: ev.name,
          label: ev.label || fallbackLabel(ev.name),
          git: ev.git,
          done: false,
        });
        if (ev.board) this.board = ev.name === 'TaskCreate' ? [...this.board, ...ev.board].slice(-7) : ev.board;
        a.turnEndAt = 0;
        break;
      }
      case 'toolDone': {
        if (!a) return;
        const act = [a.cur, ...a.queue].find((x) => x?.toolId === ev.id);
        if (act) act.done = true;
        if (ev.error) {
          a.sweatUntil = now + 2800;
          this.say(a, 'error', ev.errText || t('bubble.failed'), now + 2800);
        }
        if (this.spawnIds.has(ev.id) && !ev.async) this.finishSub(ev.id, now);
        break;
      }
      case 'think':
        if (!a) return;
        a.thinkUntil = now + 2600;
        if (!a.bubble || a.bubble.until < now || a.bubble.kind === 'think') this.say(a, 'think', ev.text || '…', now + 2600);
        break;
      case 'say':
        if (!a) return;
        this.say(a, 'say', ev.text, now + 3500);
        break;
      case 'prompt':
        this.userBubble = { kind: 'say', text: ev.text, until: now + 4500 };
        break;
      case 'turnEnd':
        if (!a) return;
        if (a.role === 'main') a.queue.push({ room: 'desk', kind: 'idle', label: '', done: true });
        else a.turnEndAt = now;
        break;
      case 'spawn': {
        this.spawnIds.add(ev.toolUseId);
        const existing = this.agents.get(ev.toolUseId);
        if (existing) {
          existing.type = ev.subagentType;
          existing.description = ev.description;
        } else {
          this.spawnSub(ev.toolUseId, ev.subagentType, ev.description, now);
        }
        if (a) this.say(a, 'phone', t('bubble.call', { type: ev.subagentType, desc: ev.description || t('bubble.callDefault') }), now + 2600);
        break;
      }
      case 'agentDone':
        this.finishSub(ev.toolUseId, now);
        break;
    }
  }

  private finishSub(key: string, now: number) {
    const s = this.agents.get(key);
    if (!s || s.role !== 'sub' || s.doneAt || s.phase === 'gone') return;
    s.doneAt = now;
    s.phase = 'reporting';
    s.queue = [];
    s.cur = null;
    this.goto(s, this.reportSpot(s));
  }

  private reportSpot(s: Agent): Pt {
    const m = this.main;
    const base = m.path.length ? m.path[m.path.length - 1] : m.pos;
    const side = s.slot % 2 ? 1 : -1;
    // Claude 앞에 반원으로 늘어선다
    const ring = [0.8, -0.8, 1.6, -1.6, 0].map((dx) => ({ x: base.x + dx * side, y: base.y + 0.8 + Math.abs(dx) * 0.25 }));
    return this.claim(s, ring);
  }

  /** 가는 중이면 도착할 곳, 아니면 지금 자리 */
  private dest(a: Agent): Pt {
    return a.path.length ? a.path[a.path.length - 1] : a.pos;
  }

  /** 후보 중 다른 사람이 서 있거나 가고 있지 않은 첫 자리 */
  private claim(a: Agent, spots: Pt[]): Pt {
    const others = [...this.agents.values()].filter((b) => b !== a && b.phase !== 'gone').map((b) => this.dest(b));
    const free = spots.find((p) => others.every((o) => Math.hypot(o.x - p.x, o.y - p.y) > 0.45));
    return free ?? spots[0];
  }

  /** 그 방에서 일할 자리. 내 번호 자리부터 빈 곳을 찾는다 */
  private spotIn(a: Agent, room: Room): Pt {
    const list = SPOTS[room];
    const start = a.slot % list.length;
    return this.claim(a, [...list.slice(start), ...list.slice(0, start)]);
  }

  /** 화면에 그릴 위치 (비켜선 만큼 더한다) */
  drawPos(a: Agent): Pt {
    return { x: a.pos.x + a.off.x, y: a.pos.y + a.off.y };
  }

  private goto(a: Agent, to: Pt) {
    const end = a.path.length ? a.path[a.path.length - 1] : a.pos;
    if (Math.hypot(end.x - to.x, end.y - to.y) < 0.05) return;
    a.path = rounded(a.pos, route(a.pos, to));
  }

  tick(now: number, dt: number) {
    this.separate(now, dt);
    for (const a of this.agents.values()) {
      this.move(a, now, dt);
      if (a.phase === 'arriving' && !a.path.length) {
        // 엘리베이터 앞에서 멈추지 않고 바로 일하러 간다
        a.phase = 'working';
        a.arrivedAt = -Infinity;
      }
      if (a.phase === 'working') this.schedule(a, now);
      if (a.phase === 'reporting' && !a.path.length) {
        if (!a.reportAt) {
          a.reportAt = now;
          this.say(a, 'report', t('bubble.report'), now + 1800);
        } else if (now - a.reportAt > 1800) {
          a.phase = 'leaving';
          this.say(a, 'bye', t('bubble.bye'), now + 3200);
          this.goto(a, ELEVATOR);
        }
      }
      if (a.phase === 'leaving' && !a.path.length) {
        a.phase = 'gone';
        a.goneAt = now;
        this.openElevator(now);
      }
      if (a.phase === 'working' && a.role === 'sub' && a.turnEndAt && now - a.lastEventAt > SUB_IDLE_DONE_MS) {
        this.finishSub(a.key, now);
      }
      if (a.bubble && a.bubble.until < now) a.bubble = null;
    }
    if (this.userBubble && this.userBubble.until < now) this.userBubble = null;
  }

  private move(a: Agent, now: number, dt: number) {
    if (!a.path.length || now < a.departAt) {
      a.speed = 0;
      return;
    }
    const sec = dt / 1000;
    // 서서히 출발하고, 도착점이 가까우면 서서히 멈춘다
    const hurry = a.queue.length > 1 ? 1.8 : 1;
    let left = 0;
    let from = a.pos;
    for (const p of a.path) {
      left += Math.hypot(p.x - from.x, p.y - from.y);
      from = p;
    }
    const cap = Math.min(SPEED * hurry * a.pace, Math.sqrt(2 * DECEL * left) + 0.6, this.leaderSpeed(a, now));
    a.speed = a.speed < cap ? Math.min(cap, a.speed + ACCEL * sec) : Math.max(cap, a.speed - DECEL * 2 * sec);
    let budget = a.speed * sec;
    while (budget > 0 && a.path.length) {
      const t = a.path[0];
      const dx = t.x - a.pos.x;
      const dy = t.y - a.pos.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= budget) {
        a.pos = { ...t };
        a.path.shift();
        budget -= dist;
        if (!a.path.length) {
          a.speed = 0;
          a.arrivedAt = now;
        }
      } else {
        a.pos = { x: a.pos.x + (dx / dist) * budget, y: a.pos.y + (dy / dist) * budget };
        budget = 0;
      }
    }
  }

  /** 바로 앞에 같은 쪽으로 걷는 사람이 있으면 그 속도 (없으면 무한) */
  private leaderSpeed(a: Agent, now: number): number {
    const dir = this.heading(a);
    if (!dir) return Infinity;
    let cap = Infinity;
    for (const b of this.agents.values()) {
      if (b === a || b.phase === 'gone' || this.waiting(b, now)) continue;
      const dx = b.pos.x - a.pos.x;
      const dy = b.pos.y - a.pos.y;
      const along = dx * dir.x + dy * dir.y;
      const across = Math.abs(dx * dir.y - dy * dir.x);
      if (along <= 0 || along > FOLLOW || across > 0.45) continue;
      const bd = this.heading(b);
      // 같은 방향이면 따라가고, 서 있거나 마주 오면 비켜 가니 조금만 늦춘다
      const same = bd && bd.x * dir.x + bd.y * dir.y > 0.5;
      cap = Math.min(cap, same ? b.speed + (along - 0.75) * 4 : SPEED * 0.7);
    }
    return Math.max(0.8, cap);
  }

  /** 걷는 방향 (단위 벡터), 서 있으면 null */
  private heading(a: Agent): Pt | null {
    if (!a.path.length) return null;
    const t = a.path[0];
    const l = Math.hypot(t.x - a.pos.x, t.y - a.pos.y);
    return l > 1e-6 ? { x: (t.x - a.pos.x) / l, y: (t.y - a.pos.y) / l } : null;
  }

  /** 가까운 사람끼리 비켜선다. 걷는 사람이 더 많이 비키고, 마주 오면 오른쪽으로 */
  private separate(now: number, dt: number) {
    const list = [...this.agents.values()].filter((a) => a.phase !== 'gone' && !this.waiting(a, now));
    const want = new Map<Agent, Pt>(list.map((a) => [a, { x: 0, y: 0 }]));
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        let dx = a.pos.x - b.pos.x;
        let dy = a.pos.y - b.pos.y;
        const d = Math.hypot(dx, dy);
        if (d >= PERSONAL) continue;
        if (d < 1e-3) {
          dx = 1;
          dy = 0.5;
        }
        const n = Math.hypot(dx, dy);
        const push = (PERSONAL - d) / PERSONAL;
        const wa = a.path.length ? 1 : 0.35;
        const wb = b.path.length ? 1 : 0.35;
        const share = (w: number) => (push * w) / (wa + wb);
        const side = (x: Agent): Pt => {
          // 진행 방향 오른쪽으로 살짝
          const h = this.heading(x);
          return h ? { x: -h.y * 0.5, y: h.x * 0.5 } : { x: 0, y: 0 };
        };
        const sa = side(a);
        const sb = side(b);
        const pa = want.get(a)!;
        const pb = want.get(b)!;
        pa.x += (dx / n + sa.x) * share(wa) * MAX_OFF * 1.6;
        pa.y += (dy / n + sa.y) * share(wa) * MAX_OFF * 1.6;
        pb.x += (-dx / n + sb.x) * share(wb) * MAX_OFF * 1.6;
        pb.y += (-dy / n + sb.y) * share(wb) * MAX_OFF * 1.6;
      }
    }
    for (const [a, w] of want) {
      const h = this.heading(a);
      // 도착할 때는 차선에서 자리로 부드럽게 돌아온다
      const lane = h ? KEEP_RIGHT * Math.min(1, a.speed / 2) : 0;
      if (h) {
        w.x += -h.y * lane;
        w.y += h.x * lane;
      }
    }
    const k = 1 - Math.exp(-dt / 250);
    for (const [a, w] of want) {
      const l = Math.hypot(w.x, w.y);
      if (l > MAX_OFF) {
        w.x *= MAX_OFF / l;
        w.y *= MAX_OFF / l;
      }
      a.off = { x: a.off.x + (w.x - a.off.x) * k, y: a.off.y + (w.y - a.off.y) * k };
    }
  }

  private schedule(a: Agent, now: number) {
    // 밀린 일이 많으면 이미 끝난 것은 건너뛴다
    while (a.queue.length > MAX_BACKLOG && a.queue[0].done) a.queue.shift();
    const free = !a.cur || a.cur.done || a.cur.kind === 'idle';
    if (!a.queue.length || !free || a.path.length || now - a.arrivedAt < MIN_DWELL) return;
    a.cur = a.queue.shift()!;
    if (a.cur.room === 'user') this.say(a, 'ask', `❓ ${a.cur.label}`, now + 60_000);
    this.goto(a, this.spotIn(a, a.cur.room));
  }

  /** 재생이 끝나면 애니메이션 없이 지금 상태로 맞춘다 */
  snap(now: number) {
    for (const [key, a] of this.agents) {
      const finished = a.doneAt || (a.phase !== 'working' && a.phase !== 'arriving');
      if (a.role === 'sub' && (finished || now - a.lastEventAt > 10 * 60_000)) {
        this.agents.delete(key);
        continue;
      }
      const last = a.queue.length ? a.queue[a.queue.length - 1] : a.cur;
      a.queue = [];
      a.cur = last;
      a.phase = 'working';
      a.path = [];
      a.pos = { ...this.spotIn(a, a.cur?.room ?? 'desk') };
      a.speed = 0;
      a.off = { x: 0, y: 0 };
      a.departAt = 0;
      a.arrivedAt = 0;
      a.bubble = a.cur?.room === 'user' && !a.cur.done ? { kind: 'ask', text: `❓ ${a.cur.label}`, until: now + 60_000 } : null;
      a.sweatUntil = 0;
      a.thinkUntil = 0;
      a.lastEventAt = now;
    }
    this.userBubble = null;
    this.elevatorOpenUntil = 0;
  }

  /** 렌더에서 지워도 되는 에이전트 정리 */
  sweep(now: number) {
    for (const [key, a] of this.agents) if (a.phase === 'gone' && now - a.goneAt > 1200) this.agents.delete(key);
  }

  poseOf(a: Agent, now: number): Pose {
    if (a.path.length) return 'walk';
    if (a.phase === 'reporting') return 'report';
    if (a.phase === 'leaving' || a.phase === 'gone') return 'wave';
    if (a.thinkUntil > now) return 'think';
    const c = a.cur;
    if (!c || c.kind === 'idle') return 'idle';
    if (c.kind === 'phone') return c.done ? 'idle' : 'phone';
    if (c.done && now - a.arrivedAt > MIN_DWELL * 2) return 'idle';
    return POSE_BY_ROOM[c.room];
  }

  /** 지금 그 방에서 돌아가는 일이 있는가 (소품 애니메이션용) */
  busy(room: Room): boolean {
    for (const a of this.agents.values()) if (!a.path.length && a.cur && !a.cur.done && a.cur.room === room) return true;
    return false;
  }

  gitBusy(): boolean {
    for (const a of this.agents.values()) if (a.cur && !a.cur.done && a.cur.git) return true;
    return false;
  }
}
