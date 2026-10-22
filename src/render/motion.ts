// 캐릭터 동작. 자세별 관절 각도를 시간에 따라 만들고, 걸음·회전·자세 전환을 부드럽게 섞는다.
import type { Pt } from '../layout.ts';
import type { Pose } from '../state/office.ts';
import { mix, NEUTRAL, type Joints, type Prop } from './figure.ts';

type Still = Exclude<Pose, 'walk'>;

const TAU = Math.PI * 2;
const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const ease = (s: number) => s * s * (3 - 2 * s);
const pos = (v: number) => Math.max(0, v);
/** 0~1 구간 가운데쯤에서 한 번 솟는 혹 */
const bump = (u: number, at: number, w: number) => {
  const d = Math.abs(u - at) / w;
  return d >= 1 ? 0 : ease(1 - d);
};
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** 서 있는 자세. t는 초 */
const STILL: Record<Still, (t: number) => Partial<Joints>> = {
  idle: (t) => {
    const breath = Math.sin(t * 2.2);
    const shift = Math.sin(t * 0.7);
    return {
      bob: 0.15 * breath,
      lean: 0.015 * breath,
      sway: 0.03 * shift,
      kneeL: 0.05 + 0.12 * pos(shift),
      kneeR: 0.05 + 0.12 * pos(-shift),
      hipL: 0.05 * pos(shift),
      hipR: 0.05 * pos(-shift),
      shL: 0.04 * breath,
      shR: 0.04 * breath,
      // 두리번두리번
      turn: 0.5 * Math.sin(t * 0.37) * Math.sin(t * 0.61 + 1),
      nod: 0.06 * Math.sin(t * 0.5),
      tilt: 0.05 * Math.sin(t * 0.43),
    };
  },
  type: (t) => {
    // 타닥타닥 치다가 가끔 멈춰서 화면을 본다
    const k = clamp((Math.sin(t * 0.8) + 0.6) * 2);
    const tap = t * 26;
    return {
      lean: 0.1,
      shL: 0.55 + 0.1 * k * pos(Math.sin(tap)),
      shR: 0.55 + 0.1 * k * pos(Math.sin(tap + Math.PI * 0.9)),
      elL: 0.5 - 0.12 * k * pos(Math.sin(tap)),
      elR: 0.5 - 0.12 * k * pos(Math.sin(tap + Math.PI * 0.9)),
      outL: -0.12,
      outR: -0.12,
      nod: 0.22 + 0.03 * Math.sin(t * 3) + 0.1 * (1 - k),
      turn: 0.06 * Math.sin(t * 1.3),
      bob: 0.1 * Math.sin(t * 2.2),
    };
  },
  read: (t) => {
    const flip = bump((t % 5) / 5, 0.9, 0.08);
    return {
      lean: 0.06,
      shL: 0.75,
      shR: 0.75 + 0.2 * flip,
      elL: 1.25,
      elR: 1.25 - 0.4 * flip,
      outL: -0.22,
      outR: -0.22 + 0.5 * flip,
      nod: 0.42,
      // 줄을 따라 눈이 움직이고, 넘길 때 고개도 따라간다
      turn: 0.15 * (((t * 0.4) % 1) * 2 - 1) - 0.25 * flip,
      bob: 0.1 * Math.sin(t * 2),
    };
  },
  operate: (t) => ({
    shR: 2.0 + 0.14 * pos(Math.sin(t * 9)),
    elR: 0.25 + 0.1 * pos(Math.sin(t * 9 + 1)),
    outR: -0.05,
    // 왼손은 허리에
    shL: -0.1,
    outL: 0.75,
    elL: 1.9,
    nod: -0.22,
    turn: 0.18 * Math.sin(t * 0.9),
    sway: 0.04 * Math.sin(t * 0.9),
    kneeL: 0.12,
  }),
  write: (t) => ({
    shR: 2.3 + 0.1 * Math.sin(t * 13),
    outR: 0.15 + 0.15 * Math.sin(t * 6.5),
    elR: 0.35,
    shL: 0.1,
    elL: 0.2,
    nod: -0.15,
    twist: 0.18,
    turn: -0.1,
    sway: 0.03 * Math.sin(t * 6.5),
  }),
  ask: (t) => ({
    shR: 2.9,
    outR: -0.05 + 0.18 * Math.sin(t * 4.4),
    elR: 0.15,
    // 발끝으로 콩콩
    bob: 0.7 * pos(Math.sin(t * 4.4)),
    nod: -0.2,
    tilt: 0.08,
    talk: pos(Math.sin(t * 13)) * 0.8,
  }),
  wave: (t) => ({
    shR: 2.6,
    outR: 0.55 + 0.35 * Math.sin(t * 13),
    elR: 0.45,
    nod: -0.05,
    bob: 0.2 * Math.sin(t * 6.5),
    talk: 0.5,
  }),
  phone: (t) => ({
    shR: 0.25,
    outR: 0.5,
    elR: 2.75,
    tilt: 0.18,
    // 빈손으로 손짓하며 통화
    shL: 0.45 + 0.3 * Math.sin(t * 2.7),
    outL: 0.2,
    elL: 1.1 + 0.4 * Math.sin(t * 2.7 + 1),
    nod: 0.06 * Math.sin(t * 5),
    sway: 0.04 * Math.sin(t * 1.1),
    talk: pos(Math.sin(t * 11)) * pos(Math.sin(t * 1.7) + 0.3),
  }),
  think: (t) => {
    const tap = 0.18 * pos(Math.sin(t * 7));
    return {
      // 오른손은 턱, 왼손은 오른팔꿈치 받치기
      shR: 0.6,
      outR: -0.25,
      elR: 2.5,
      shL: 0.55,
      outL: -0.45,
      elL: 1.7,
      nod: -0.18,
      tilt: 0.15 + 0.06 * Math.sin(t * 1.3),
      turn: 0.25 * Math.sin(t * 0.6),
      look: 1,
      kneeR: 0.05 + tap,
      hipR: tap * 0.4,
    };
  },
  report: (t) => {
    const bow = bump((t % 2.2) / 2.2, 0.45, 0.3);
    return {
      shL: 1.0,
      shR: 1.0,
      elL: 0.6,
      elR: 0.6,
      outL: -0.2,
      outR: -0.2,
      lean: 0.35 * bow,
      nod: 0.25 * bow,
      talk: (1 - bow) * pos(Math.sin(t * 12)) * 0.8,
    };
  },
};

const PROP: Partial<Record<Still, Prop>> = { read: 'book', report: 'paper', phone: 'phone', write: 'marker' };

/** 걷기/뛰기 한 주기. p는 걸음 위상, run은 0(걷기)~1(뛰기) */
function gait(p: number, run: number): Joints {
  const s = Math.sin(p);
  const c = Math.cos(p);
  const amp = 0.5 + 0.25 * run;
  return {
    ...NEUTRAL,
    hipL: amp * s,
    hipR: -amp * s,
    // 앞으로 내딛는 다리의 무릎을 굽힌다
    kneeL: 0.15 + (0.8 + 0.6 * run) * pos(c),
    kneeR: 0.15 + (0.8 + 0.6 * run) * pos(-c),
    shL: -0.75 * amp * s * (1 + 0.5 * run),
    shR: 0.75 * amp * s * (1 + 0.5 * run),
    elL: 0.25 + 1.2 * run + 0.25 * pos(-s),
    elR: 0.25 + 1.2 * run + 0.25 * pos(s),
    outL: 0.1,
    outR: 0.1,
    // 다리를 모을 때 몸이 가장 높다
    bob: (1 - Math.abs(s)) * (1 + 1.4 * run) - 0.3,
    lean: 0.05 + 0.2 * run,
    twist: 0.12 * s * (1 + run),
    turn: -0.1 * s * (1 + run),
    sway: 0.04 * s,
    nod: 0.04 + 0.08 * run,
  };
}

export interface Frame {
  joints: Joints;
  prop: Prop;
  heading: number;
  /** 이번 프레임에 땅을 디딘 발 (0 왼발, 1 오른발)과 세기 */
  steps: { foot: 0 | 1; strength: number }[];
}

/** 에이전트 한 명의 동작 상태 */
export class Motion {
  heading = Math.PI / 4;
  private speed = 0;
  private phase = 0;
  private turnStep = 0;
  private still: Still = 'idle';
  private prev: Still = 'idle';
  private stillAt = -1e9;
  private last: (Pt & { t: number }) | null = null;
  private readonly seed: number;

  constructor(key: string) {
    let h = 0;
    for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    this.seed = (h % 1000) / 1000;
  }

  /** face: 멈춰 있을 때 바라볼 방향 (null이면 그대로) */
  update(p: Pt, pose: Pose, face: number | null, now: number): Frame {
    const dt = this.last ? clamp((now - this.last.t) / 1000, 0, 0.1) : 0;
    let vx = 0;
    let vy = 0;
    if (this.last && dt > 0) {
      vx = (p.x - this.last.x) / dt;
      vy = (p.y - this.last.y) / dt;
      // 순간이동(재생 끝, 엘리베이터)은 걸음으로 치지 않는다
      if (Math.hypot(p.x - this.last.x, p.y - this.last.y) > 1.5) vx = vy = 0;
    }
    this.last = { x: p.x, y: p.y, t: now };
    const raw = Math.hypot(vx, vy);
    const k = dt ? 1 - Math.exp(-dt / 0.12) : 1;
    this.speed += (raw - this.speed) * k;

    // 몸 돌리기: 움직이면 가는 쪽, 멈추면 일하는 쪽
    const target = raw > 0.3 ? Math.atan2(vy, vx) : face;
    let diff = 0;
    if (target != null) {
      diff = wrap(target - this.heading);
      const turn = diff * (dt ? 1 - Math.exp(-dt / 0.1) : 1);
      const cap = 11 * dt;
      this.heading = wrap(this.heading + (dt ? clamp(turn, -cap, cap) : turn));
    }
    const walkW = clamp(this.speed / 2.2);
    // 제자리에서 크게 돌 때는 종종걸음
    const wantStep = walkW < 0.3 && Math.abs(diff) > 0.35 ? 1 : 0;
    this.turnStep += (wantStep - this.turnStep) * (dt ? 1 - Math.exp(-dt / 0.08) : 1);
    const w = Math.max(walkW, 0.45 * this.turnStep);

    const run = clamp((this.speed - 5.2) / 2.5);
    const stride = 1.5 + 0.7 * run;
    const before = this.phase;
    this.phase += (TAU * this.speed * dt) / stride + TAU * 2.4 * this.turnStep * dt;
    const steps: Frame['steps'] = [];
    if (w > 0.25) {
      const plant = (ph: number) => Math.floor((ph - Math.PI / 2) / Math.PI);
      for (let n = plant(before) + 1; n <= plant(this.phase); n++) steps.push({ foot: n % 2 === 0 ? 0 : 1, strength: w * (0.4 + 0.6 * run) });
    }

    // 서 있는 자세는 바뀔 때 0.3초 동안 섞는다
    const want: Still = pose === 'walk' ? 'idle' : pose;
    if (want !== this.still) {
      this.prev = this.still;
      this.still = want;
      this.stillAt = now;
    }
    const t = now / 1000 + this.seed * 13;
    const at = (s: Still) => ({ ...NEUTRAL, ...STILL[s](t) });
    const s = ease(clamp((now - this.stillAt) / 300));
    let joints = s < 1 ? mix(at(this.prev), at(this.still), s) : at(this.still);

    if (w > 0.001) {
      const g = gait(this.phase, run);
      const walking = mix(joints, g, ease(w));
      // 퇴근길에는 걸으면서 손을 흔든다
      if (this.still === 'wave') Object.assign(walking, { shR: joints.shR, outR: joints.outR, elR: joints.elR });
      joints = walking;
    }

    // 눈 깜빡임
    const period = 3.2 + this.seed * 1.6;
    const u = t % period;
    joints.blink = u < 0.14 ? Math.sin((u / 0.14) * Math.PI) : 0;

    const prop = (s > 0.5 ? PROP[this.still] : PROP[this.prev]) ?? null;
    return { joints, prop: w > 0.6 && this.still !== 'wave' ? null : prop, heading: this.heading, steps };
  }
}
