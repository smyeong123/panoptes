import { t } from '../i18n.ts';
import { CORRIDOR_Y, doorOf, GRID, ROOMS, type RoomKey } from '../layout.ts';
import { box, esc, iso, line, planeX, planeY, planeZ, quad, shade } from './iso.ts';

export interface Item {
  d: number;
  svg: string;
}

// 색은 모두 styles.css의 테마 변수다. 라이트/다크를 바꿔도 SVG는 그대로 둔다.
const v = (name: string) => `var(--${name})`;

const WALL_H = 92;
const GLASS_H = 30;
const DOOR_W = 1.6;

const FLOOR: Record<RoomKey, { fill: string; kind: 'wood' | 'carpet' | 'raised' }> = {
  library: { fill: v('floor-wood'), kind: 'wood' },
  dev: { fill: v('floor-carpet'), kind: 'carpet' },
  server: { fill: v('floor-server'), kind: 'raised' },
  search: { fill: v('floor-carpet-2'), kind: 'carpet' },
  meeting: { fill: v('floor-wood-2'), kind: 'wood' },
  office: { fill: v('floor-wood'), kind: 'wood' },
};

const LABEL: Record<RoomKey, Parameters<typeof t>[0]> = {
  library: 'room.library',
  dev: 'room.dev',
  server: 'room.server',
  search: 'room.search',
  meeting: 'room.meeting',
  office: 'room.office',
};

function rng(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

function item(x: number, y: number, w: number, d: number, svg: string): Item {
  return { d: x + w / 2 + y + d / 2, svg };
}

// ── 작은 가구 부품 ───────────────────────────────────────
function legs(x: number, y: number, w: number, d: number, h: number): string {
  const s = 0.07;
  return [
    [x + 0.06, y + 0.06],
    [x + w - 0.13, y + 0.06],
    [x + 0.06, y + d - 0.13],
    [x + w - 0.13, y + d - 0.13],
  ]
    .map(([lx, ly]) => box(lx, ly, s, s, h, v('frame')))
    .join('');
}

/** 얇은 상판 + 가는 다리 */
function table(x: number, y: number, w: number, d: number, h: number, top = v('desk')): string {
  return legs(x, y, w, d, h - 2.5) + box(x, y, w, d, 2.5, top, h - 2.5);
}

/** 사무용 의자. back: 등받이가 뒤(-y) 쪽인지 */
function chair(x: number, y: number, color: string, back = false): string {
  const seat =
    box(x + 0.22, y + 0.22, 0.06, 0.06, 9, v('frame')) +
    quad(x + 0.08, y + 0.08, 0.34, 0.34, v('frame'), 0.6) +
    box(x, y, 0.5, 0.5, 2.5, color, 9);
  const rest = box(x, back ? y : y + 0.42, 0.5, 0.08, 12, shade(color, 0.92), 11);
  return back ? rest + seat : seat + rest;
}

/** 화분: 화분 상자 + 잎 */
function plant(x: number, y: number, big = false): Item {
  const s = big ? 0.55 : 0.42;
  const p = iso(x + s / 2, y + s / 2, big ? 16 : 12);
  const k = big ? 1.35 : 1;
  const leaves = `<g transform="translate(${p.sx.toFixed(1)},${p.sy.toFixed(1)}) scale(${k})">
    <ellipse cx="-5" cy="-7" rx="5" ry="8" transform="rotate(-25 -5 -7)" style="fill:${v('plant')}"/>
    <ellipse cx="5" cy="-9" rx="5" ry="9" transform="rotate(28 5 -9)" style="fill:${v('plant-2')}"/>
    <ellipse cx="0" cy="-15" rx="4.5" ry="9" style="fill:${v('plant')}"/>
    <ellipse cx="-2" cy="-20" rx="3.5" ry="6" transform="rotate(-12 -2 -20)" style="fill:${v('plant-2')}"/></g>`;
  return item(x, y, s, s, box(x, y, s, s, big ? 16 : 12, v('pot')) + leaves);
}

/** 플로어 스탠드. 밤에는 바닥에 빛이 고인다 */
function floorLamp(x: number, y: number): Item {
  const g = iso(x, y, 0);
  const top = iso(x, y, 62);
  return item(
    x - 0.2,
    y - 0.2,
    0.4,
    0.4,
    `<ellipse class="night" cx="${g.sx}" cy="${g.sy}" rx="58" ry="29" fill="url(#lamp-glow)"/>` +
      quad(x - 0.18, y - 0.18, 0.36, 0.36, v('frame'), 0.5) +
      box(x - 0.03, y - 0.03, 0.06, 0.06, 56, v('frame')) +
      `<g transform="translate(${top.sx},${top.sy})"><path d="M-9,8 L-6,-4 L6,-4 L9,8 Z" style="fill:${v('lamp-shade')}"/><ellipse class="night" cx="0" cy="8" rx="9" ry="2.5" style="fill:${v('glow')}"/></g>`,
  );
}

/** 모니터: 받침 + 얇은 화면(정면). inner는 화면 안 SVG(로컬 좌표 u,v). */
function monitor(x: number, y: number, z: number, wU: number, hV: number, inner: string, cls = ''): string {
  const tiles = wU / 32;
  const stand =
    box(x + tiles / 2 - 0.05, y - 0.04, 0.1, 0.08, 7, v('frame'), z) + quad(x + tiles / 2 - 0.16, y - 0.12, 0.32, 0.22, v('frame'), z + 0.4);
  return (
    stand +
    `<g class="${cls}" transform="${planeX(x, y, z + 7 + hV)}">
      <rect x="-1" y="-1" width="${wU + 2}" height="${hV + 2}" rx="1.6" style="fill:${v('screen-frame')}"/>
      <rect class="screen-glow" x="0" y="0" width="${wU}" height="${hV}" rx="0.8" style="fill:${v('screen-bg')}"/>
      ${inner}</g>`
  );
}

function laptop(x: number, y: number, z: number): string {
  return (
    quad(x, y, 0.42, 0.28, v('steel'), z + 0.6) +
    `<g transform="${planeX(x, y, z + 12)}"><rect width="13.4" height="11" rx="1" style="fill:${v('steel-dark')}"/><rect class="screen-glow" x="1" y="1" width="11.4" height="8.4" style="fill:${v('screen-bg')}"/></g>`
  );
}

/** 1인용 라운지 의자. 등받이는 뒤(-y) 쪽 */
function lounge(x: number, y: number, w: number, d: number, color: string): string {
  return (
    box(x, y, w, 0.2, 18, shade(color, 0.9)) +
    box(x, y, 0.16, d, 12, shade(color, 0.95)) +
    box(x + 0.16, y + 0.2, w - 0.32, d - 0.2, 8, color) +
    box(x + w - 0.16, y, 0.16, d, 12, shade(color, 0.95))
  );
}

/** 등받이가 앞(+y) 쪽인 소파: 라운지 안쪽을 바라본다 */
function sofa(x: number, y: number, w: number, d: number, color: string): string {
  return (
    box(x, y, 0.18, d, 12, shade(color, 0.95)) +
    box(x + 0.18, y, w - 0.36, d - 0.2, 8, color) +
    box(x + w - 0.18, y, 0.18, d, 12, shade(color, 0.95)) +
    box(x, y + d - 0.2, w, 0.2, 19, shade(color, 0.9))
  );
}

// ── 바닥 ────────────────────────────────────────────────
function floor(): string {
  let s = box(-0.35, -0.35, GRID.w + 0.7, GRID.d + 0.7, 12, v('slab'), -12);
  s += quad(0, 0, GRID.w, GRID.d, v('floor-corridor'));
  // 복도: 큰 콘크리트 타일
  for (let x = 2; x < GRID.w; x += 2) s += line(x, 5, x, 7, v('floor-line'));
  s += line(0, 5, GRID.w, 5, v('floor-line')) + line(0, 7, GRID.w, 7, v('floor-line'));
  for (const k of Object.keys(ROOMS) as RoomKey[]) {
    const r = ROOMS[k];
    const f = FLOOR[k];
    s += quad(r.x, r.y, r.w, r.d, f.fill);
    if (f.kind === 'wood') {
      // 원목 마루: x 방향 판자, 이음매는 엇갈리게
      for (let y = r.y + 0.5; y < r.y + r.d; y += 0.5) s += line(r.x, y, r.x + r.w, y, v('floor-line'), 0, 0.5);
      for (let y = r.y, i = 0; y < r.y + r.d; y += 0.5, i++) {
        for (let x = r.x + (i % 2 ? 1.2 : 2.6); x < r.x + r.w; x += 2.8) s += line(x, y, x, y + 0.5, v('floor-line'), 0, 0.5);
      }
    } else if (f.kind === 'carpet') {
      for (let x = r.x + 1; x < r.x + r.w; x++) s += line(x, r.y, x, r.y + r.d, v('floor-line-soft'), 0, 0.4);
      for (let y = r.y + 1; y < r.y + r.d; y++) s += line(r.x, y, r.x + r.w, y, v('floor-line-soft'), 0, 0.4);
    } else {
      // 이중 바닥: 타일 + 타공 패널
      for (let x = r.x + 1; x < r.x + r.w; x++) s += line(x, r.y, x, r.y + r.d, v('floor-line'), 0, 0.8);
      for (let y = r.y + 1; y < r.y + r.d; y++) s += line(r.x, y, r.x + r.w, y, v('floor-line'), 0, 0.8);
      for (const [tx, ty] of [
        [15, 2],
        [17, 2],
        [16, 3],
        [18, 3],
      ]) {
        s += `<g transform="${planeZ(tx, ty, 0)}">`;
        for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) s += `<circle cx="${5 + i * 7.3}" cy="${5 + j * 7.3}" r="1.3" style="fill:${v('floor-line')}"/>`;
        s += `</g>`;
      }
    }
  }
  // 러그
  s += quad(1.3, 2.05, 3.3, 1.9, v('rug'), 0.3);
  s += quad(17.85, 11.0, 2.0, 1.85, v('rug-2'), 0.3);
  // 엘리베이터 앞 발판
  s += quad(0, 5.25, 1.05, 1.5, v('landing'), 0.3);
  return s;
}

// ── 바깥벽, 창, 데이터월, 엘리베이터 ─────────────────────────
function skyline(wU: number, hV: number, seed: number): string {
  const r = rng(seed);
  let s = `<rect width="${wU}" height="${hV}" fill="url(#sky)"/>`;
  s += `<g class="night">`;
  for (let i = 0; i < 14; i++) s += `<circle cx="${(r() * wU).toFixed(1)}" cy="${(r() * hV * 0.45).toFixed(1)}" r="${(0.4 + r() * 0.5).toFixed(2)}" fill="#fff"/>`;
  s += `</g>`;
  let x = -2;
  while (x < wU) {
    const bw = 8 + r() * 12;
    const bh = hV * (0.25 + r() * 0.45);
    s += `<rect x="${x.toFixed(1)}" y="${(hV - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" style="fill:${v(r() < 0.5 ? 'skyline' : 'skyline-2')}"/>`;
    for (let wy = hV - bh + 3; wy < hV - 2; wy += 4) {
      for (let wx = x + 2; wx < x + bw - 2; wx += 3.5) {
        if (r() < 0.45) s += `<rect class="city-light" x="${wx.toFixed(1)}" y="${wy.toFixed(1)}" width="1.6" height="1.8" style="fill:${v('city-light')}"/>`;
      }
    }
    x += bw + 1 + r() * 3;
  }
  return s;
}

function windowPanel(transform: string, wU: number, hV: number, seed: number, panes: number): string {
  let s = `<g transform="${transform}"><clipPath id="win-${seed}"><rect width="${wU}" height="${hV}"/></clipPath>`;
  s += `<g clip-path="url(#win-${seed})">${skyline(wU, hV, seed)}</g>`;
  s += `<rect width="${wU}" height="${hV}" fill="url(#glass-sheen)"/>`;
  for (let i = 1; i < panes; i++) s += `<rect x="${((wU / panes) * i - 0.8).toFixed(1)}" y="0" width="1.6" height="${hV}" style="fill:${v('mullion')}"/>`;
  s += `<rect width="${wU}" height="${hV}" fill="none" style="stroke:${v('mullion')};stroke-width:2.4"/></g>`;
  return s;
}

function worldMap(wU: number, hV: number): string {
  // 대륙을 타원 몇 개로 근사한 도트 지도
  const land: [number, number, number, number][] = [
    [0.2, 0.32, 0.13, 0.2],
    [0.29, 0.7, 0.07, 0.2],
    [0.5, 0.3, 0.07, 0.12],
    [0.52, 0.62, 0.08, 0.2],
    [0.7, 0.32, 0.17, 0.2],
    [0.83, 0.75, 0.07, 0.09],
  ];
  let s = '';
  const step = 4.2;
  for (let y = 4; y < hV - 3; y += step) {
    for (let x = 4; x < wU - 3; x += step) {
      const u = x / wU;
      const t = y / hV;
      const on = land.some(([cx, cy, rx, ry]) => ((u - cx) / rx) ** 2 + ((t - cy) / ry) ** 2 < 1);
      s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${on ? 1.15 : 0.55}" style="fill:${v(on ? 'map-land' : 'map-sea')}"/>`;
    }
  }
  for (const [u, t] of [
    [0.22, 0.35],
    [0.51, 0.28],
    [0.74, 0.36],
    [0.3, 0.72],
    [0.82, 0.74],
  ]) {
    s += `<circle class="ping" cx="${(u * wU).toFixed(1)}" cy="${(t * hV).toFixed(1)}" r="3" style="fill:none;stroke:${v('holo-line')};stroke-width:1"/>`;
    s += `<circle cx="${(u * wU).toFixed(1)}" cy="${(t * hV).toFixed(1)}" r="1.6" style="fill:${v('holo-line')}"/>`;
  }
  s += `<rect class="scan-line" x="0" y="0" width="3" height="${hV}" style="fill:${v('holo-line')}" opacity=".5"/>`;
  return s;
}

function outerWalls(): string {
  const P = (list: { sx: number; sy: number }[]) => list.map((p) => `${p.sx.toFixed(1)},${p.sy.toFixed(1)}`).join(' ');
  let s = `<polygon points="${P([iso(0, 0, 0), iso(GRID.w, 0, 0), iso(GRID.w, 0, WALL_H), iso(0, 0, WALL_H)])}" style="fill:${v('wall')}"/>`;
  s += `<polygon points="${P([iso(0, 0, 0), iso(0, GRID.d, 0), iso(0, GRID.d, WALL_H), iso(0, 0, WALL_H)])}" style="fill:${v('wall-side')}"/>`;
  // 걸레받이
  s += `<polygon points="${P([iso(0, 0, 0), iso(GRID.w, 0, 0), iso(GRID.w, 0, 4), iso(0, 0, 4)])}" style="fill:${v('baseboard')}"/>`;
  s += `<polygon points="${P([iso(0, 0, 0), iso(0, GRID.d, 0), iso(0, GRID.d, 4), iso(0, 0, 4)])}" style="fill:${v('baseboard')}"/>`;
  // 개발실 뒤 통창, 자료실 위 고창, 자료실 옆 창
  s += windowPanel(planeX(7.25, 0.01, 86), 5.5 * 32, 78, 3, 4);
  s += windowPanel(planeX(0.3, 0.01, 88), 5.4 * 32, 6, 5, 3);
  s += windowPanel(planeY(0.01, 4.7, 86), 4.4 * 32, 66, 9, 3);
  // 서버실 흡음 패널
  s += `<g transform="${planeX(14.1, 0.01, 88)}">`;
  for (let i = 0; i < 12; i++) s += `<rect x="${(i * 15.6 + 1).toFixed(1)}" y="0" width="13.6" height="84" rx="1" style="fill:${v(i % 2 ? 'panel-dark' : 'panel-dark-2')}"/>`;
  s += `</g>`;
  // 정보검색실 데이터월
  const dw = 5.0 * 32;
  s += `<g transform="${planeY(0.02, 12.5, 84)}">
    <rect x="-3" y="-3" width="${dw + 6}" height="62" rx="2" style="fill:${v('screen-frame')}"/>
    <rect class="screen-glow" width="${dw}" height="56" style="fill:${v('datawall-bg')}"/>
    <clipPath id="datawall-clip"><rect width="${dw}" height="56"/></clipPath>
    <g clip-path="url(#datawall-clip)">${worldMap(dw, 56)}</g></g>`;
  // 벽 윗마감
  s += box(0, -0.2, GRID.w, 0.2, 4, v('wall-cap'), WALL_H - 4);
  s += box(-0.2, -0.2, 0.2, GRID.d + 0.2, 4, v('wall-cap'), WALL_H - 4);
  return s;
}

function elevator(): string {
  const w = 1.5 * 32;
  return `<g id="elevator" transform="${planeY(0.02, 6.75, 66)}">
    <rect x="-5" y="-26" width="${w + 10}" height="92" rx="2" style="fill:${v('steel-dark')}"/>
    <rect x="0" y="0" width="${w}" height="66" style="fill:${v('elevator-inside')}"/>
    <clipPath id="elev-clip"><rect x="0" y="0" width="${w}" height="66"/></clipPath>
    <g clip-path="url(#elev-clip)">
      <g class="elev-door elev-door-l"><rect x="0" y="0" width="${w / 2}" height="66" style="fill:${v('steel')}"/><rect x="${w / 2 - 3}" y="0" width="1" height="66" fill="#fff" opacity=".35"/></g>
      <g class="elev-door elev-door-r"><rect x="${w / 2}" y="0" width="${w / 2}" height="66" style="fill:${v('steel')}"/><rect x="${w / 2 + 2}" y="0" width="1" height="66" fill="#fff" opacity=".35"/></g>
    </g>
    <rect x="${w / 2 - 15}" y="-20" width="30" height="13" rx="3" fill="#0d0f13"/>
    <text id="elev-indicator" x="${w / 2}" y="-10.5" class="elev-indicator">1F</text>
    <rect x="${w + 2}" y="26" width="3" height="9" rx="1.5" fill="#0d0f13"/><circle cx="${w + 3.5}" cy="30.5" r="1" class="elev-call"/>
  </g>`;
}

// ── 유리 칸막이 ───────────────────────────────────────────
/** 1타일씩 쪼갠 유리벽(깊이 정렬용). 복도 쪽엔 문 틈을 낸다. */
function partitions(): Item[] {
  const out: Item[] = [];
  const t = 0.06;
  const pane = (x: number, y: number, w: number, d: number) =>
    box(x, y, w, d, 2.4, v('glass-frame')) +
    box(x, y, w, d, GLASS_H - 3.6, v('glass'), 2.4, { front: v('glass'), side: v('glass-edge') }) +
    box(x, y, w, d, 1.2, v('glass-frame'), GLASS_H - 1.2) +
    box(x, y, Math.min(w, 0.05), Math.min(d, 0.05), GLASS_H, v('glass-frame'));
  for (const k of Object.keys(ROOMS) as RoomKey[]) {
    const r = ROOMS[k];
    const back = r.y < CORRIDOR_Y;
    const door = doorOf(k);
    const corridorEdgeY = back ? r.y + r.d : r.y;
    for (const ey of [r.y, r.y + r.d]) {
      if (ey === 0) continue;
      for (let x = r.x; x < r.x + r.w; x += 1) {
        const x1 = Math.min(x + 1, r.x + r.w);
        if (ey === corridorEdgeY && x1 > door.x - DOOR_W / 2 && x < door.x + DOOR_W / 2) continue;
        out.push(item(x, ey - t / 2, x1 - x, t, pane(x, ey - t / 2, x1 - x, t)));
      }
    }
    for (const ex of [r.x, r.x + r.w]) {
      if (ex === 0) continue;
      for (let y = r.y; y < r.y + r.d; y += 1) {
        const y1 = Math.min(y + 1, r.y + r.d);
        out.push(item(ex - t / 2, y, t, y1 - y, pane(ex - t / 2, y, t, y1 - y)));
      }
    }
  }
  return out;
}

// ── 방별 가구 ────────────────────────────────────────────
function library(): Item[] {
  const out: Item[] = [];
  const r = rng(7);
  const books = ['book-1', 'book-2', 'book-3', 'book-4', 'book-5', 'book-6'].map(v);
  for (const x of [0.3, 2.2, 4.1]) {
    let s = box(x, 0.12, 1.6, 0.55, 80, v('shelf'));
    s += `<g transform="${planeX(x, 0.67, 77)}">`;
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 2; col++) {
        const cx = 2 + col * 24.6;
        const cy = row * 19;
        s += `<rect x="${cx}" y="${cy}" width="22.6" height="16.5" style="fill:${v('shelf-back')}"/>`;
        if (r() < 0.16) {
          s += `<rect x="${cx + 8}" y="${cy + 10}" width="6" height="6.5" rx="1" style="fill:${v('pot')}"/><circle cx="${cx + 11}" cy="${cy + 7}" r="5" style="fill:${v('plant-2')}"/>`;
          continue;
        }
        let u = cx + 1;
        while (u < cx + 21) {
          const bw = 2 + r() * 2.4;
          const bh = 10 + r() * 5.5;
          if (u + bw > cx + 21.6) break;
          s += `<rect x="${u.toFixed(1)}" y="${(cy + 16.5 - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" style="fill:${books[Math.floor(r() * books.length)]}"/>`;
          u += bw + 0.4;
          if (r() < 0.08) u += 3;
        }
      }
    }
    s += `</g>`;
    out.push(item(x, 0.12, 1.6, 0.55, s));
  }
  // 열람 테이블 + 펼친 책 + 노트북
  let t = table(1.6, 2.4, 2.6, 1.0, 17, v('wood-light'));
  t += quad(2.0, 2.6, 0.45, 0.35, v('paper'), 17.3) + quad(2.45, 2.6, 0.45, 0.35, shade(v('paper'), 0.95), 17.3);
  t += laptop(3.3, 2.6, 17);
  out.push(item(1.6, 2.4, 2.6, 1.0, t));
  out.push(item(4.55, 2.45, 0.8, 0.8, lounge(4.55, 2.45, 0.8, 0.8, v('accent-chair'))));
  out.push(floorLamp(5.55, 1.6));
  out.push(plant(0.25, 4.25, true));
  return out;
}

function dev(): Item[] {
  const out: Item[] = [];
  const r = rng(11);
  const codeCols = ['#7ee787', '#79c0ff', '#ffa657', '#d2a8ff', '#e6edf3'];
  [7.4, 9.3, 11.2].forEach((x, i) => {
    // 스탠딩 데스크 + 울트라와이드 모니터
    let code = `<clipPath id="imac-clip-${i}"><rect width="38" height="18"/></clipPath><g clip-path="url(#imac-clip-${i})"><g class="code-lines">`;
    for (let n = 0; n < 24; n++) {
      const indent = [0, 3, 6, 3][n % 4];
      const len = 6 + r() * 22;
      code += `<rect x="${2 + indent}" y="${1.4 + n * 2.4}" width="${Math.min(len, 34 - indent).toFixed(1)}" height="1.3" rx="0.6" fill="${codeCols[Math.floor(r() * codeCols.length)]}"/>`;
    }
    code += `</g></g>`;
    let s = table(x, 1.1, 1.4, 0.8, 26);
    s += monitor(x + 0.1, 1.42, 26, 38, 18, code, 'code-screen');
    s += quad(x + 0.35, 1.62, 0.7, 0.2, v('keyboard'), 26.3);
    if (i === 1) s += box(x + 1.15, 1.25, 0.12, 0.12, 4, v('mug'), 26);
    out.push(item(x, 1.1, 1.4, 0.8, s));
  });
  out.push(plant(12.4, 0.3, true));
  out.push(item(7.2, 3.9, 0.8, 0.8, lounge(7.2, 3.9, 0.8, 0.7, v('accent-chair-2'))));
  return out;
}

function server(): Item[] {
  const out: Item[] = [];
  const r = rng(23);
  [14.4, 15.6, 16.8, 18.0].forEach((x) => {
    let s = box(x, 0.3, 0.9, 0.8, 84, v('rack'));
    s += `<g transform="${planeX(x, 1.1, 82)}">
      <rect x="1" y="0" width="26.8" height="80" rx="1" style="fill:${v('rack-front')}"/>
      <rect class="rack-strip" x="1" y="0" width="26.8" height="1.6" style="fill:${v('accent-led')}"/>`;
    for (let row = 0; row < 9; row++) {
      s += `<rect x="3" y="${4 + row * 8.4}" width="22.8" height="6.4" rx="0.8" style="fill:${v('rack-unit')}"/>`;
      for (let c = 0; c < 4; c++) {
        const color = r() < 0.75 ? '#38f28a' : r() < 0.6 ? '#4cc3ff' : '#ffbf3c';
        const delay = (r() * 1.4).toFixed(2);
        s += `<circle class="rack-led" cx="${6 + c * 3.4}" cy="${7.2 + row * 8.4}" r="1" fill="${color}" style="animation-delay:-${delay}s"/>`;
      }
      s += `<rect x="20" y="${6 + row * 8.4}" width="4" height="2.2" style="fill:${v('rack-front')}"/>`;
    }
    s += `<rect x="1" y="0" width="26.8" height="80" rx="1" fill="url(#glass-sheen)" opacity=".6"/></g>`;
    out.push(item(x, 0.3, 0.9, 0.8, s));
  });
  // 항온항습기 + git 표시
  const sign = iso(19.35, 3.85, 44);
  let c = box(19.0, 3.4, 0.7, 0.9, 30, v('appliance'));
  c += `<g transform="${planeX(19.0, 4.3, 26)}">`;
  for (let i = 0; i < 6; i++) c += `<rect x="3" y="${3 + i * 3}" width="16" height="1.2" style="fill:${shade(v('appliance'), 0.75)}"/>`;
  c += `</g><g transform="translate(${sign.sx},${sign.sy})"><g class="git-sign"><circle r="11" fill="#f05133"/><text y="4" class="git-text">git</text></g></g>`;
  out.push(item(19.0, 3.4, 0.7, 0.9, c));
  return out;
}

function search(): Item[] {
  const out: Item[] = [];
  [1.6, 3.6].forEach((x) => {
    const ui = `<rect x="3" y="3" width="26" height="3" rx="1.5" style="fill:${v('screen-ui')}"/>
      <rect class="search-bar" x="4" y="3.6" width="16" height="1.8" rx="0.9" style="fill:${v('holo-line')}"/>
      <rect x="3" y="8.5" width="22" height="1.3" style="fill:${v('screen-ui')}"/><rect x="3" y="11.3" width="16" height="1.3" style="fill:${v('screen-ui')}"/>`;
    const s = table(x, 7.9, 1.6, 0.8, 18) + monitor(x + 0.25, 8.2, 18, 32, 15, ui);
    out.push(item(x, 7.9, 1.6, 0.8, s));
  });
  // 홀로그램 지구본
  const g = iso(1.0, 11.6, 0);
  let s = box(0.7, 11.3, 0.6, 0.6, 18, v('steel')) + quad(0.75, 11.35, 0.5, 0.5, v('holo-line'), 18.3, 'opacity=".6"');
  s += `<g class="globe" transform="translate(${g.sx},${g.sy - 46})">
    <circle r="15" style="fill:${v('holo')}" opacity=".35"/>
    <circle r="15" style="fill:none;stroke:${v('holo-line')};stroke-width:1.2"/>
    <ellipse class="globe-meridian" rx="7" ry="15" style="fill:none;stroke:${v('holo-line')};stroke-width:1"/>
    <ellipse rx="15" ry="4.5" style="fill:none;stroke:${v('holo-line')};stroke-width:.8" opacity=".8"/>
    <path d="M-8,-6 q5,-6 10,-2 q4,3 -1,8 q-5,2 -9,-6z M3,4 q5,-2 8,3 q-3,5 -8,2z" style="fill:${v('holo-line')}" opacity=".7"/></g>`;
  out.push(item(0.7, 11.3, 0.6, 0.6, s));
  // MCP 허브
  const hub = iso(5.2, 12.0, 34);
  out.push(
    item(
      4.95,
      11.75,
      0.5,
      0.5,
      box(4.95, 11.75, 0.5, 0.5, 28, v('steel-dark')) +
        quad(5.0, 11.8, 0.4, 0.4, v('holo-line'), 28.2, 'opacity=".8"') +
        `<g transform="translate(${hub.sx},${hub.sy})"><circle class="antenna-wave" r="6" style="fill:none;stroke:${v('holo-line')};stroke-width:1.5"/><circle r="2.5" style="fill:${v('holo-line')}"/></g>`,
    ),
  );
  out.push(plant(5.4, 7.35));
  return out;
}

function meeting(): Item[] {
  const out: Item[] = [];
  // 유리 화이트보드: 왼쪽 칸막이(x=7)에 걸려 있고 오른쪽을 봄
  const y0 = 12.4;
  const w = 4.4 * 32;
  const board = `<g transform="${planeY(7.25, y0, 84)}">
      <rect x="-2" y="-2" width="${w + 4}" height="68" rx="2" style="fill:${v('frame')}"/>
      <rect x="0" y="0" width="${w}" height="64" rx="1" style="fill:${v('board')}"/>
      <text x="6" y="10" class="wb-title">TODO / PLAN</text>
      <g id="whiteboard-lines"></g>
      <rect x="${w - 34}" y="60" width="9" height="2.4" rx="1" fill="#e85d5d"/><rect x="${w - 22}" y="60" width="9" height="2.4" rx="1" fill="#4a90d9"/>
    </g>`;
  out.push(item(7.1, 8.0, 0.3, 4.4, board));
  // 회의 테이블 + 의자
  for (const x of [8.9, 10.2]) out.push(item(x, 9.05, 0.5, 0.5, chair(x, 9.05, v('chair'), true)));
  let t = table(8.6, 9.6, 3.0, 1.4, 16, v('wood-light'));
  t += laptop(9.2, 9.85, 16) + quad(10.4, 10.2, 0.35, 0.45, v('paper'), 16.3) + box(11.1, 9.9, 0.12, 0.12, 4, v('mug'), 16);
  out.push(item(8.6, 9.6, 3.0, 1.4, t));
  for (const x of [9.0, 10.4]) out.push(item(x, 11.15, 0.5, 0.5, chair(x, 11.15, v('chair'), false)));
  out.push(item(11.8, 10.0, 0.5, 0.5, chair(11.8, 10.0, v('chair'), false)));
  out.push(plant(12.3, 12.3, true));
  return out;
}

function office(): Item[] {
  const out: Item[] = [];
  // Claude 자리: 책상 + 모니터 + 전화기 + 명패
  let s = table(15.0, 8.2, 1.8, 0.9, 18);
  s += monitor(15.35, 8.5, 18, 34, 18, `<text x="17" y="13" class="screen-glyph">✳</text>`);
  const ph = iso(16.45, 8.75, 18.5);
  s += `<g transform="translate(${ph.sx},${ph.sy})"><g class="desk-phone"><rect x="-6" y="-5" width="12" height="6" rx="2" style="fill:${v('phone')}"/><rect x="-7" y="-8" width="14" height="3.4" rx="1.7" style="fill:${shade(v('phone'), 0.8)}"/></g></g>`;
  s += `<g transform="${planeX(15.1, 9.1, 10)}"><rect width="26" height="7" rx="1.5" style="fill:${v('plate')};stroke:#d97757;stroke-width:.6"/><text x="13" y="5.4" class="nameplate">Claude</text></g>`;
  out.push(item(15.0, 8.2, 1.8, 0.9, s));
  out.push(item(16.55, 9.2, 0.5, 0.5, chair(16.55, 9.2, v('accent-chair'), false)));
  // 서브에이전트용 핫데스크
  for (const x of [14.5, 16.4]) out.push(item(x, 11.0, 1.2, 0.7, table(x, 11.0, 1.2, 0.7, 17) + laptop(x + 0.4, 11.15, 17)));
  // 내 자리
  let u = table(18.0, 8.2, 1.7, 0.9, 18);
  u += monitor(18.25, 8.5, 18, 34, 18, `<text x="3" y="6.5" class="term-glyph">&gt;_ claude</text><rect class="term-cursor" x="3" y="9.5" width="4" height="2" fill="#7ee787"/>`);
  const mug = iso(19.4, 8.9, 18);
  u += `<g transform="translate(${mug.sx},${mug.sy})"><rect x="-3" y="-7" width="6" height="7" rx="1" style="fill:${v('mug')}"/><path d="M3,-5 q3,0 3,2 q0,2 -3,2" fill="none" style="stroke:${v('mug')}"/></g>`;
  u += `<g transform="${planeX(18.1, 9.1, 10)}"><rect width="26" height="7" rx="1.5" style="fill:${v('plate')};stroke:#4a90d9;stroke-width:.6"/><text x="13" y="5.4" class="nameplate" id="user-nameplate">${t('plate.user')}</text></g>`;
  out.push(item(18.0, 8.2, 1.7, 0.9, u));
  out.push(item(18.15, 9.3, 0.5, 0.5, chair(18.15, 9.3, v('chair-mine'), false)));
  // 라운지: 소파 + 커피 테이블
  out.push(item(18.6, 11.55, 0.8, 0.45, table(18.6, 11.55, 0.8, 0.45, 8, v('wood-light')) + box(18.9, 11.65, 0.12, 0.12, 4, v('mug'), 8)));
  out.push(item(18.0, 12.25, 1.8, 0.6, sofa(18.0, 12.25, 1.8, 0.6, v('sofa'))));
  out.push(plant(19.45, 7.3, true));
  out.push(floorLamp(14.45, 7.6));
  return out;
}

export function roomLabels(): string {
  let s = '';
  for (const k of Object.keys(ROOMS) as RoomKey[]) {
    const r = ROOMS[k];
    const label = t(LABEL[k]);
    const wU = [...label].length * 6.2 + 8;
    s += `<g class="room-label" transform="${planeX(r.x + 0.3, r.y + r.d + 0.05, GLASS_H - 8)}">
      <rect x="0" y="-9" width="${wU.toFixed(1)}" height="11" rx="5.5" class="room-sign"/>
      <text x="5" y="-1.2" class="room-label-text">${esc(label)}</text></g>`;
  }
  return s;
}

const DEFS = `<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--sky-top)"/><stop offset="1" style="stop-color:var(--sky-bottom)"/></linearGradient>
  <linearGradient id="glass-sheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset=".6" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <radialGradient id="lamp-glow"><stop offset="0" style="stop-color:var(--glow);stop-opacity:.5"/><stop offset="1" style="stop-color:var(--glow);stop-opacity:0"/></radialGradient>
</defs>`;

export interface Building {
  under: string;
  items: Item[];
  labels: string;
  anchors: { user: { sx: number; sy: number } };
}

export function buildFloor(): Building {
  const items = [...partitions(), ...library(), ...dev(), ...server(), ...search(), ...meeting(), ...office()];
  return {
    under: DEFS + floor() + outerWalls() + elevator(),
    items,
    labels: roomLabels(),
    anchors: { user: iso(18.8, 8.6, 70) },
  };
}

export const VIEWBOX = (() => {
  const left = iso(0, GRID.d).sx - 40;
  const right = iso(GRID.w, 0).sx + 40;
  const top = iso(0, 0, WALL_H).sy - 70;
  const bottom = iso(GRID.w, GRID.d).sy + 46;
  return `${left} ${top} ${right - left} ${bottom - top}`;
})();
