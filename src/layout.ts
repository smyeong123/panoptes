import type { Room } from '../shared/events.ts';

// 한 층의 배치도. 단위는 타일, x는 오른쪽 아래, y는 왼쪽 아래로 뻗는다.
export interface Pt {
  x: number;
  y: number;
}

export interface RoomRect {
  x: number;
  y: number;
  w: number;
  d: number;
}

export const GRID = { w: 20, d: 13 };
export const CORRIDOR_Y = 6;

/** 방 6개. 'desk'(Claude 자리)와 'user'(내 자리)는 같은 오픈 오피스를 쓴다. */
export const ROOMS: Record<Exclude<Room, 'desk' | 'user'> | 'office', RoomRect> = {
  library: { x: 0, y: 0, w: 6, d: 5 },
  dev: { x: 7, y: 0, w: 6, d: 5 },
  server: { x: 14, y: 0, w: 6, d: 5 },
  search: { x: 0, y: 7, w: 6, d: 6 },
  meeting: { x: 7, y: 7, w: 6, d: 6 },
  office: { x: 14, y: 7, w: 6, d: 6 },
};

export type RoomKey = keyof typeof ROOMS;

export function rectOf(room: Room): RoomKey {
  return room === 'desk' || room === 'user' ? 'office' : room;
}

/** 복도 쪽 출입문 위치 (방 안쪽 한 칸) */
export function doorOf(key: RoomKey): Pt {
  const r = ROOMS[key];
  const back = r.y < CORRIDOR_Y;
  return { x: r.x + r.w / 2, y: back ? r.y + r.d - 0.4 : r.y + 0.4 };
}

export const ELEVATOR: Pt = { x: 0.5, y: CORRIDOR_Y };
export const ELEVATOR_OUT: Pt = { x: 1.8, y: CORRIDOR_Y };

/** 각 방에서 일하는 자리. 에이전트 슬롯 번호로 나눠 쓴다. */
export const SPOTS: Record<Room, Pt[]> = {
  library: [
    { x: 1.1, y: 1.4 },
    { x: 3.0, y: 1.4 },
    { x: 4.9, y: 1.4 },
    { x: 2.7, y: 4.1 },
    { x: 4.6, y: 4.1 },
  ],
  dev: [
    { x: 8.1, y: 2.6 },
    { x: 10.0, y: 2.6 },
    { x: 11.9, y: 2.6 },
    { x: 9.0, y: 4.2 },
    { x: 11.0, y: 4.2 },
  ],
  server: [
    { x: 14.9, y: 2.1 },
    { x: 16.1, y: 2.1 },
    { x: 17.3, y: 2.1 },
    { x: 18.5, y: 2.1 },
    { x: 16.7, y: 4.0 },
  ],
  search: [
    { x: 2.4, y: 9.4 },
    { x: 4.4, y: 9.4 },
    { x: 2.0, y: 11.8 },
    { x: 4.2, y: 11.8 },
    { x: 1.0, y: 10.6 },
  ],
  meeting: [
    { x: 8.3, y: 8.6 },
    { x: 10.0, y: 8.6 },
    { x: 11.7, y: 8.6 },
    { x: 9.0, y: 12.0 },
    { x: 11.0, y: 12.0 },
  ],
  desk: [
    { x: 15.9, y: 9.7 },
    { x: 15.0, y: 12.4 },
    { x: 16.9, y: 12.4 },
    { x: 14.8, y: 10.6 },
    { x: 17.2, y: 10.8 },
  ],
  user: [
    { x: 18.9, y: 9.8 },
    { x: 18.0, y: 10.4 },
    { x: 19.4, y: 10.9 },
  ],
};

export function spotFor(room: Room, slot: number): Pt {
  const list = SPOTS[room];
  return list[slot % list.length];
}

function inRect(p: Pt, r: RoomRect): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.d;
}

function roomAt(p: Pt): RoomKey | null {
  for (const k of Object.keys(ROOMS) as RoomKey[]) if (inRect(p, ROOMS[k])) return k;
  return null;
}

/** 방 → 문 → 복도 → 문 → 방 경로. 시작점은 포함하지 않는다. */
export function route(from: Pt, to: Pt): Pt[] {
  const a = roomAt(from);
  const b = roomAt(to);
  if (a && a === b) return [to];
  const path: Pt[] = [];
  if (a) {
    const d = doorOf(a);
    path.push(d, { x: d.x, y: CORRIDOR_Y });
  }
  if (b) {
    const d = doorOf(b);
    path.push({ x: d.x, y: CORRIDOR_Y }, d);
  } else {
    path.push({ x: to.x, y: CORRIDOR_Y });
  }
  path.push(to);
  return path;
}

/** 꺾이는 곳마다 작은 곡선을 넣는다. 시작점(from)은 포함하지 않는다. */
export function rounded(from: Pt, path: Pt[], radius = 0.45, steps = 5): Pt[] {
  const pts = [from, ...path];
  const out: Pt[] = [];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    const next = pts[i + 1];
    if (!next) {
      out.push(p);
      break;
    }
    const prev = pts[i - 1];
    const l1 = Math.hypot(p.x - prev.x, p.y - prev.y);
    const l2 = Math.hypot(next.x - p.x, next.y - p.y);
    const r = Math.min(radius, l1 / 2, l2 / 2);
    if (r < 0.05) {
      out.push(p);
      continue;
    }
    const a = { x: p.x + ((prev.x - p.x) / l1) * r, y: p.y + ((prev.y - p.y) / l1) * r };
    const b = { x: p.x + ((next.x - p.x) / l2) * r, y: p.y + ((next.y - p.y) / l2) * r };
    // a → p → b 2차 베지어
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const u = 1 - t;
      out.push({ x: u * u * a.x + 2 * u * t * p.x + t * t * b.x, y: u * u * a.y + 2 * u * t * p.y + t * t * b.y });
    }
  }
  return out;
}
