// 아이소메트릭 투영과 SVG 조각 도우미.
// 색은 CSS 변수(var(--…))를 그대로 받아 style로 칠하므로 테마를 바꿔도 다시 그릴 필요가 없다.
export const TW = 64;
export const TH = 32;
const HX = TW / 2;
const HY = TH / 2;

export interface SP {
  sx: number;
  sy: number;
}

export function iso(x: number, y: number, z = 0): SP {
  return { sx: (x - y) * HX, sy: (x + y) * HY - z };
}

function pts(list: SP[]): string {
  return list.map((p) => `${p.sx.toFixed(1)},${p.sy.toFixed(1)}`).join(' ');
}

/** f<1이면 어둡게, f>1이면 밝게 섞은 색 */
export function shade(color: string, f: number): string {
  if (f === 1) return color;
  return f < 1
    ? `color-mix(in srgb, ${color} ${Math.round(f * 100)}%, black)`
    : `color-mix(in srgb, ${color} ${Math.round((2 - f) * 100)}%, white)`;
}

function poly(list: SP[], fill: string, extra = ''): string {
  return `<polygon points="${pts(list)}" style="fill:${fill}" ${extra}/>`;
}

export function quad(x: number, y: number, w: number, d: number, fill: string, z = 0, extra = ''): string {
  return poly([iso(x, y, z), iso(x + w, y, z), iso(x + w, y + d, z), iso(x, y + d, z)], fill, extra);
}

/** 바닥 위의 선 (x 방향 또는 y 방향) */
export function line(x0: number, y0: number, x1: number, y1: number, stroke: string, z = 0, width = 0.6): string {
  const a = iso(x0, y0, z);
  const b = iso(x1, y1, z);
  return `<line x1="${a.sx.toFixed(1)}" y1="${a.sy.toFixed(1)}" x2="${b.sx.toFixed(1)}" y2="${b.sy.toFixed(1)}" style="stroke:${stroke};stroke-width:${width}"/>`;
}

export interface BoxOpts {
  /** 면 투명도 (유리) */
  op?: number;
  cls?: string;
  /** 앞면/옆면을 그림자 대신 이 색으로 */
  front?: string;
  side?: string;
}

/** 직육면체: 윗면 + 앞(+y)면 + 옆(+x)면 */
export function box(x: number, y: number, w: number, d: number, h: number, color: string, z = 0, o: BoxOpts = {}): string {
  const ex = o.op != null ? `opacity="${o.op}"` : '';
  const front = poly([iso(x, y + d, z), iso(x + w, y + d, z), iso(x + w, y + d, z + h), iso(x, y + d, z + h)], o.front ?? shade(color, 0.88), ex);
  const side = poly([iso(x + w, y, z), iso(x + w, y + d, z), iso(x + w, y + d, z + h), iso(x + w, y, z + h)], o.side ?? shade(color, 0.74), ex);
  const top = quad(x, y, w, d, color, z + h, ex);
  const body = front + side + top;
  return o.cls ? `<g class="${o.cls}">${body}</g>` : body;
}

/** y가 일정한 면(정면을 봄) 위의 로컬 좌표계. u: +x 방향(1타일=32), v: 아래 방향(px) */
export function planeX(x: number, y: number, z: number): string {
  const o = iso(x, y, z);
  return `matrix(1,0.5,0,1,${o.sx.toFixed(1)},${o.sy.toFixed(1)})`;
}

/** x가 일정한 면(오른쪽을 봄) 위의 로컬 좌표계. u: -y 방향(1타일=32), v: 아래 방향(px) */
export function planeY(x: number, y: number, z: number): string {
  const o = iso(x, y, z);
  return `matrix(1,-0.5,0,1,${o.sx.toFixed(1)},${o.sy.toFixed(1)})`;
}

/** 바닥(z 일정) 위의 로컬 좌표계. u: +x, v: +y (1타일=32) */
export function planeZ(x: number, y: number, z: number): string {
  const o = iso(x, y, z);
  return `matrix(1,0.5,-1,0.5,${o.sx.toFixed(1)},${o.sy.toFixed(1)})`;
}

/** 깊이 정렬용 값. 클수록 앞에 그린다. */
export function depthOf(x: number, y: number): number {
  return x + y;
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
