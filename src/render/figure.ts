// 직육면체 관절 인형. 관절 각도를 받아 3D로 세운 뒤 건물과 같은 아이소메트릭으로 투영한다.
// 단위는 캐릭터 기준(발끝 원점, z 위쪽, 몸 앞이 +y). 세계 x/y는 타일 축과 같은 방향이다.
import { shade } from './iso.ts';

export interface Joints {
  bob: number;
  lean: number;
  twist: number;
  sway: number;
  hipL: number;
  hipR: number;
  kneeL: number;
  kneeR: number;
  shL: number;
  shR: number;
  outL: number;
  outR: number;
  elL: number;
  elR: number;
  nod: number;
  turn: number;
  tilt: number;
  blink: number;
  look: number;
  talk: number;
}

export const NEUTRAL: Joints = {
  bob: 0,
  lean: 0,
  twist: 0,
  sway: 0,
  hipL: 0,
  hipR: 0,
  kneeL: 0.05,
  kneeR: 0.05,
  shL: 0,
  shR: 0,
  outL: 0.07,
  outR: 0.07,
  elL: 0.15,
  elR: 0.15,
  nod: 0,
  turn: 0,
  tilt: 0,
  blink: 0,
  look: 0,
  talk: 0,
};

export function mix(a: Joints, b: Joints, s: number): Joints {
  const out = { ...a };
  for (const k of Object.keys(a) as (keyof Joints)[]) out[k] = a[k] + (b[k] - a[k]) * s;
  return out;
}

export type Prop = 'book' | 'paper' | 'phone' | 'marker' | null;
export type Hat = 'beanie' | 'explorer' | 'glasses' | 'headset' | 'none';

export interface Look {
  outfit: string;
  pants: string;
  hair: string;
  hat: Hat;
  tag: string;
}

type Bone = 'pelvis' | 'torso' | 'head' | 'uarmL' | 'farmL' | 'uarmR' | 'farmR' | 'thighL' | 'shinL' | 'footL' | 'thighR' | 'shinR' | 'footR';
type V3 = [number, number, number];

interface Part {
  bone: Bone;
  a: V3;
  b: V3;
  color: string;
  kind?: 'eye' | 'mouth';
  prop?: Prop;
}

/** 캐릭터 크기 (뼈 길이). 발바닥에서 고관절까지 FOOT+SHIN+THIGH */
const FOOT = 2.5;
const SHIN = 6;
const THIGH = 6;
const HIP_Z = FOOT + SHIN + THIGH;
const UPPER_ARM = 6;
const SHOULDER_X = 8.2;
const NECK_Z = 11.5;
/** 아이소메트릭 투영 (건물: 타일 1칸 = (32,16)px, 길이 35.78px) */
const KX = 0.894;
const KY = 0.447;
export const SCALE = 1.15;
/** 화면 쪽(관찰자)을 향하는 방향. 깊이 정렬과 뒷면 제거에 쓴다 */
const VIEW: V3 = [1, 1, 0.894];

const SKIN = '#ffe0c2';

const box = (bone: Bone, a: V3, b: V3, color: string, extra: Partial<Part> = {}): Part => ({ bone, a, b, color, ...extra });

/** 좌우 대칭 한 쌍 */
function pair(boneL: Bone, boneR: Bone, a: V3, b: V3, color: string, extra: Partial<Part> = {}): Part[] {
  return [box(boneL, [-b[0], a[1], a[2]], [-a[0], b[1], b[2]], color, extra), box(boneR, a, b, color, extra)];
}

export function partsFor(l: Look): Part[] {
  const sleeve = shade(l.outfit, 0.82);
  const shoe = '#3a3532';
  const p: Part[] = [
    // 다리
    box('thighL', [-2.2, -2.3, -THIGH - 0.2], [2.2, 2.3, 0.4], l.pants),
    box('thighR', [-2.2, -2.3, -THIGH - 0.2], [2.2, 2.3, 0.4], l.pants),
    box('shinL', [-2, -2, -SHIN], [2, 2, 0.2], l.pants),
    box('shinR', [-2, -2, -SHIN], [2, 2, 0.2], l.pants),
    box('footL', [-2.2, -2.3, -FOOT], [2.2, 4.2, 0], shoe),
    box('footR', [-2.2, -2.3, -FOOT], [2.2, 4.2, 0], shoe),
    // 몸
    box('pelvis', [-6, -3.6, -2.4], [6, 3.6, 2.2], l.pants),
    box('torso', [-6.5, -4, 0], [6.5, 4, NECK_Z], l.outfit),
    box('torso', [-2.4, 3.9, NECK_Z - 2.2], [2.4, 4.3, NECK_Z], SKIN),
    // 팔
    box('uarmL', [-1.8, -1.8, -UPPER_ARM], [1.8, 1.8, 1.2], sleeve),
    box('uarmR', [-1.8, -1.8, -UPPER_ARM], [1.8, 1.8, 1.2], sleeve),
    box('farmL', [-1.7, -1.7, -5.4], [1.7, 1.7, 0.2], sleeve),
    box('farmR', [-1.7, -1.7, -5.4], [1.7, 1.7, 0.2], sleeve),
    box('farmL', [-1.9, -1.9, -7.6], [1.9, 1.9, -5.3], SKIN),
    box('farmR', [-1.9, -1.9, -7.6], [1.9, 1.9, -5.3], SKIN),
    // 머리
    box('head', [-7, -6.5, 0.5], [7, 6.5, 13.5], SKIN),
    ...pair('head', 'head', [2.3, 6.2, 5.2], [4.1, 7.0, 7.8], '#2b2b2b', { kind: 'eye' }),
    ...pair('head', 'head', [4.6, 6.2, 3.4], [6.3, 6.7, 4.5], '#ffb3a7'),
    box('head', [-1.5, 6.2, 2.9], [1.5, 6.8, 3.7], '#7a4a3a', { kind: 'mouth' }),
    // 머리카락: 정수리, 뒷머리, 옆머리, 앞머리
    box('head', [-7.4, -6.9, 11], [7.4, 6.9, 14.4], l.hair),
    box('head', [-7.4, -6.9, 4], [7.4, -4.6, 11.2], l.hair),
    ...pair('head', 'head', [6.6, -6.9, 6.5], [7.4, 3.5, 11.2], l.hair),
    box('head', [-7.4, 5.4, 10], [3.5, 6.95, 12.2], l.hair),
    // 손에 드는 물건 (자세에 따라 보이기)
    box('torso', [-5.5, 8.6, 3.2], [5.5, 10.2, 10.6], '#3f6fd1', { prop: 'book' }),
    box('torso', [-0.5, 10.1, 3.4], [0.5, 10.4, 10.4], '#ffffff', { prop: 'book' }),
    box('torso', [-4.6, 8.8, 3.6], [4.6, 9.3, 11.4], '#ffffff', { prop: 'paper' }),
    box('farmR', [-0.9, -1.6, -11.2], [0.9, 1.6, -6.4], '#222222', { prop: 'phone' }),
    box('farmR', [-0.5, 0, -11], [0.5, 1, -7], '#e85d5d', { prop: 'marker' }),
  ];
  switch (l.hat) {
    case 'beanie':
      p.push(box('head', [-7.9, -7.4, 11.6], [7.9, 7.4, 16.4], '#c4613f'), box('head', [-8.2, -7.7, 10.6], [8.2, 7.7, 12.6], '#a9502f'));
      break;
    case 'explorer':
      p.push(
        box('head', [-10.5, -10.5, 13], [10.5, 10.5, 14], '#6b8e23'),
        box('head', [-6.4, -6.4, 14], [6.4, 6.4, 19.5], '#7da33a'),
        box('head', [-6.6, -6.6, 14], [6.6, 6.6, 15.4], '#c9a227'),
      );
      break;
    case 'glasses':
      p.push(
        box('head', [-5.6, 6.9, 7.8], [5.6, 7.4, 8.6], '#2b2b2b'),
        ...pair('head', 'head', [1.6, 6.9, 4.6], [4.9, 7.4, 5.2], '#2b2b2b'),
        ...pair('head', 'head', [7.0, -2, 7.8], [7.5, 7.4, 8.4], '#2b2b2b'),
      );
      break;
    case 'headset':
      p.push(
        box('head', [-7.8, -1, 13.8], [7.8, 1, 15.2], '#333333'),
        ...pair('head', 'head', [7, -2.2, 4.2], [9, 2.2, 9.4], '#333333'),
        box('head', [6.4, 2, 3.4], [7.4, 6.6, 4.4], '#333333'),
      );
      break;
  }
  return p;
}

// ── 3×4 행렬 ───────────────────────────────
type M = number[];

function mul(a: M, b: M): M {
  return [
    a[0] * b[0] + a[1] * b[4] + a[2] * b[8],
    a[0] * b[1] + a[1] * b[5] + a[2] * b[9],
    a[0] * b[2] + a[1] * b[6] + a[2] * b[10],
    a[0] * b[3] + a[1] * b[7] + a[2] * b[11] + a[3],
    a[4] * b[0] + a[5] * b[4] + a[6] * b[8],
    a[4] * b[1] + a[5] * b[5] + a[6] * b[9],
    a[4] * b[2] + a[5] * b[6] + a[6] * b[10],
    a[4] * b[3] + a[5] * b[7] + a[6] * b[11] + a[7],
    a[8] * b[0] + a[9] * b[4] + a[10] * b[8],
    a[8] * b[1] + a[9] * b[5] + a[10] * b[9],
    a[8] * b[2] + a[9] * b[6] + a[10] * b[10],
    a[8] * b[3] + a[9] * b[7] + a[10] * b[11] + a[11],
  ];
}
const chain = (...ms: M[]) => ms.reduce(mul);
const T = (x: number, y: number, z: number): M => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z];
/** 앞(+y)으로 숙이기/팔다리 앞으로 */
function RX(a: number): M {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0];
}
/** 옆으로 기울이기 */
function RY(a: number): M {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0];
}
/** 제자리 돌기 */
function RZ(a: number): M {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0];
}
const apply = (m: M, x: number, y: number, z: number): V3 => [
  m[0] * x + m[1] * y + m[2] * z + m[3],
  m[4] * x + m[5] * y + m[6] * z + m[7],
  m[8] * x + m[9] * y + m[10] * z + m[11],
];
const turnOnly = (m: M, x: number, y: number, z: number): V3 => [m[0] * x + m[1] * y + m[2] * z, m[4] * x + m[5] * y + m[6] * z, m[8] * x + m[9] * y + m[10] * z];

/** heading: 몸 앞이 바라보는 세계 방향 (라디안, atan2(dy, dx)) */
function frames(j: Joints, heading: number): Record<Bone, M> {
  const root = chain(T(0, 0, j.bob), RZ(heading - Math.PI / 2));
  const pelvis = chain(root, T(0, 0, HIP_Z), RY(j.sway * 0.5));
  const torso = chain(pelvis, T(0, 0, 1.5), RZ(j.twist), RX(-j.lean), RY(j.sway));
  const head = chain(torso, T(0, 0, NECK_Z), RZ(j.turn), RX(-j.nod), RY(j.tilt));
  const arm = (side: -1 | 1, sh: number, out: number, el: number) => {
    const upper = chain(torso, T(side * SHOULDER_X, 0, NECK_Z - 1.5), RY(-side * out), RX(sh));
    return [upper, chain(upper, T(0, 0, -UPPER_ARM + 0.2), RX(el))];
  };
  const leg = (side: -1 | 1, hip: number, knee: number) => {
    const thigh = chain(pelvis, T(side * 3, 0, 0), RX(hip));
    const shin = chain(thigh, T(0, 0, -THIGH), RX(-knee));
    // 발은 바닥과 평평하게 되돌린다
    return [thigh, shin, chain(shin, T(0, 0, -SHIN), RX(knee - hip))];
  };
  const [uarmL, farmL] = arm(-1, j.shL, j.outL, j.elL);
  const [uarmR, farmR] = arm(1, j.shR, j.outR, j.elR);
  const [thighL, shinL, footL] = leg(-1, j.hipL, j.kneeL);
  const [thighR, shinR, footR] = leg(1, j.hipR, j.kneeR);
  return { pelvis, torso, head, uarmL, farmL, uarmR, farmR, thighL, shinL, footL, thighR, shinR, footR };
}

export function project(p: V3): [number, number] {
  return [(p[0] - p[1]) * KX * SCALE, ((p[0] + p[1]) * KY - p[2]) * SCALE];
}

const FACES: [number[], V3][] = [
  [[0, 2, 6, 4], [-1, 0, 0]],
  [[1, 3, 7, 5], [1, 0, 0]],
  [[0, 1, 5, 4], [0, -1, 0]],
  [[2, 3, 7, 6], [0, 1, 0]],
  [[0, 1, 3, 2], [0, 0, -1]],
  [[4, 5, 7, 6], [0, 0, 1]],
];

export interface Face {
  points: string;
  fill: string;
}

export interface Pose3D {
  faces: Face[];
  /** 머리 꼭대기와 두 발의 화면 좌표 (발끝 원점 기준) */
  headTop: [number, number];
  feet: [[number, number], [number, number]];
}

/** 관절 각도 → 앞에서 뒤로 정렬된 다각형 목록 */
export function pose3d(parts: Part[], j: Joints, heading: number, prop: Prop): Pose3D {
  const f = frames(j, heading);
  const boxes: { d: number; faces: Face[] }[] = [];
  for (const part of parts) {
    if (part.prop !== undefined && part.prop !== prop) continue;
    let [x0, y0, z0] = part.a;
    let [x1, y1, z1] = part.b;
    if (part.kind === 'eye') {
      const mid = (z0 + z1) / 2 + j.look * 0.7;
      const half = ((z1 - z0) / 2) * (1 - 0.85 * j.blink);
      z0 = mid - half;
      z1 = mid + half;
    } else if (part.kind === 'mouth') {
      z0 -= j.talk * 1.3;
    }
    const m = f[part.bone];
    const corners: V3[] = [];
    for (let k = 0; k < 8; k++) corners.push(apply(m, k & 1 ? x1 : x0, k & 2 ? y1 : y0, k & 4 ? z1 : z0));
    const c = apply(m, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    const faces: Face[] = [];
    for (const [idx, n] of FACES) {
      const wn = turnOnly(m, n[0], n[1], n[2]);
      if (wn[0] * VIEW[0] + wn[1] * VIEW[1] + wn[2] * VIEW[2] <= 1e-3) continue;
      // 건물과 같은 명암: 윗면 1, 앞(+y)면 0.88, 옆(+x)면 0.74
      const light = Math.min(1.04, Math.max(0.62, 0.74 + 0.26 * wn[2] + 0.14 * wn[1]));
      const points = idx
        .map((i) => {
          const [sx, sy] = project(corners[i]);
          return `${sx.toFixed(1)},${sy.toFixed(1)}`;
        })
        .join(' ');
      faces.push({ points, fill: shade(part.color, Math.round(light * 50) / 50) });
    }
    boxes.push({ d: c[0] * VIEW[0] + c[1] * VIEW[1] + c[2] * VIEW[2], faces });
  }
  boxes.sort((p, q) => p.d - q.d);
  const foot = (m: M) => project(apply(m, 0, 1, -FOOT));
  return {
    faces: boxes.flatMap((b) => b.faces),
    headTop: project(apply(f.head, 0, 0, 17)),
    feet: [foot(f.footL), foot(f.footR)],
  };
}
