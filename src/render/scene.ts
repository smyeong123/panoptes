import type { Room } from '../../shared/events.ts';
import type { Agent, Office } from '../state/office.ts';
import { buildFloor, VIEWBOX } from './building.ts';
import { characterSvg, lookFor } from './character.ts';
import { partsFor, pose3d } from './figure.ts';
import { esc, iso, depthOf } from './iso.ts';
import { Motion } from './motion.ts';

const NS = 'http://www.w3.org/2000/svg';

const CHAR_SCALE = 1.4;

/** 일하는 자리에서 바라보는 쪽. 책상·서가·랙은 뒷벽(-y), 회의실 화이트보드는 왼벽(-x) */
const FACING: Record<Room, number> = {
  library: -Math.PI / 2,
  dev: -Math.PI / 2,
  server: -Math.PI / 2,
  search: -Math.PI / 2,
  meeting: Math.PI,
  desk: -Math.PI / 2,
  user: -Math.PI / 2,
};

interface CharView {
  g: SVGGElement;
  body: SVGGElement;
  shadow: SVGEllipseElement;
  spark: SVGTextElement | null;
  bubble: HTMLDivElement;
  parts: ReturnType<typeof partsFor>;
  motion: Motion;
  polys: SVGPolygonElement[];
  drawn: string[];
  depth: number;
  pose: string;
  bubbleKey: string;
}

/** 사무실 SVG. 정적인 건물은 한 번 그리고, 캐릭터만 매 프레임 옮긴다. */
export class Scene {
  readonly svg: SVGSVGElement;
  private sceneLayer: SVGGElement;
  private fxLayer: SVGGElement;
  private boardLines: SVGGElement;
  private elevInd: SVGTextElement;
  private userBubble: HTMLDivElement;
  private views = new Map<string, CharView>();
  private boardKey = '';
  private floorLabel = '1F';

  constructor(host: HTMLElement) {
    const b = buildFloor();
    host.innerHTML = `<svg class="office" viewBox="${VIEWBOX}" preserveAspectRatio="xMidYMid meet" xmlns="${NS}">
      <g class="under">${b.under}</g>
      <g class="fx"></g>
      <g class="scene">${b.items
        .sort((p, q) => p.d - q.d)
        .map((i) => `<g class="prop-item" data-d="${i.d.toFixed(3)}">${i.svg}</g>`)
        .join('')}</g>
      <g class="labels">${b.labels}</g>
      <foreignObject class="bubble-fo user-fo" x="${b.anchors.user.sx - 110}" y="${b.anchors.user.sy - 100}" width="220" height="104">
        <div class="bubble-wrap" xmlns="http://www.w3.org/1999/xhtml"><div class="bubble user-bubble"></div></div>
      </foreignObject>
    </svg>`;
    this.svg = host.querySelector('svg')!;
    this.sceneLayer = this.svg.querySelector('.scene')!;
    this.fxLayer = this.svg.querySelector('.fx')!;
    this.boardLines = this.svg.querySelector('#whiteboard-lines')!;
    this.elevInd = this.svg.querySelector('#elev-indicator')!;
    this.userBubble = this.svg.querySelector('.user-bubble')!;
  }

  setFloorLabel(label: string) {
    this.floorLabel = label;
    this.elevInd.textContent = label;
  }

  clearCharacters() {
    for (const v of this.views.values()) v.g.remove();
    this.views.clear();
    this.fxLayer.replaceChildren();
  }

  private create(a: Agent): CharView {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', `char char-${a.role}`);
    const look = lookFor(a.type, a.role);
    g.innerHTML = characterSvg(look, a.role);
    this.sceneLayer.appendChild(g);
    return {
      g,
      body: g.querySelector('.body3d')!,
      shadow: g.querySelector('.shadow')!,
      spark: g.querySelector('.spark'),
      bubble: g.querySelector('.bubble')!,
      parts: partsFor(look),
      motion: new Motion(a.key),
      polys: [],
      drawn: [],
      depth: -1,
      pose: '',
      bubbleKey: '',
    };
  }

  /** 멈춰 있을 때 바라볼 방향 */
  private faceOf(a: Agent, office: Office): number | null {
    if (a.phase === 'reporting') {
      const m = office.main.pos;
      return Math.atan2(m.y - a.pos.y, m.x - a.pos.x);
    }
    return a.cur ? FACING[a.cur.room] : null;
  }

  /** 관절 인형을 다시 그린다. 다각형은 재사용하고 바뀐 것만 고친다 */
  private draw(v: CharView, a: Agent, office: Office, now: number, sx: number, sy: number) {
    const f = v.motion.update(office.drawPos(a), office.poseOf(a, now), this.faceOf(a, office), now);
    const p = pose3d(v.parts, f.joints, f.heading, f.prop);
    p.faces.forEach((face, i) => {
      let poly = v.polys[i];
      if (!poly) {
        poly = document.createElementNS(NS, 'polygon');
        v.body.appendChild(poly);
        v.polys.push(poly);
        v.drawn.push('');
      }
      const key = face.points + face.fill;
      if (v.drawn[i] === key) return;
      v.drawn[i] = key;
      poly.setAttribute('points', face.points);
      poly.style.fill = face.fill;
      poly.style.stroke = face.fill;
    });
    for (let i = p.faces.length; i < v.polys.length; i++) {
      if (v.drawn[i] === '') continue;
      v.drawn[i] = '';
      v.polys[i].setAttribute('points', '');
    }
    // 몸이 뜨면 그림자가 작아진다
    v.shadow.setAttribute('rx', (11 - f.joints.bob * 0.6).toFixed(2));
    if (v.spark) {
      v.spark.setAttribute('x', p.headTop[0].toFixed(1));
      v.spark.setAttribute('y', p.headTop[1].toFixed(1));
    }
    for (const step of f.steps) {
      const [fx, fy] = p.feet[step.foot];
      this.puff(sx + fx * CHAR_SCALE, sy + fy * CHAR_SCALE, step.strength);
    }
  }

  /** 발자국 먼지 */
  private puff(x: number, y: number, strength: number) {
    if (this.fxLayer.childElementCount > 40) return;
    const e = document.createElementNS(NS, 'ellipse');
    e.setAttribute('class', 'puff');
    e.setAttribute('cx', x.toFixed(1));
    e.setAttribute('cy', y.toFixed(1));
    e.setAttribute('rx', (3 + 4 * strength).toFixed(1));
    e.setAttribute('ry', (1.5 + 2 * strength).toFixed(1));
    e.style.opacity = (0.25 + 0.5 * strength).toFixed(2);
    e.addEventListener('animationend', () => e.remove());
    this.fxLayer.appendChild(e);
  }

  /** 깊이 순서가 바뀌었을 때만 DOM 위치를 옮긴다 */
  private place(v: CharView, depth: number) {
    const depthAt = (el: Element | null) => (el ? Number((el as SVGGElement).dataset.d) : NaN);
    v.g.dataset.d = depth.toFixed(3);
    const prev = depthAt(v.g.previousElementSibling);
    const next = depthAt(v.g.nextElementSibling);
    if (!(prev > depth) && !(next < depth)) return;
    let before: Element | null = null;
    for (const el of this.sceneLayer.children) {
      if (el !== v.g && depthAt(el) > depth) {
        before = el;
        break;
      }
    }
    this.sceneLayer.insertBefore(v.g, before);
  }

  render(office: Office, now: number) {
    for (const [key, v] of this.views) {
      if (!office.agents.has(key)) {
        v.g.remove();
        this.views.delete(key);
      }
    }
    for (const a of office.agents.values()) {
      let v = this.views.get(a.key);
      if (!v) {
        v = this.create(a);
        this.views.set(a.key, v);
      }
      const at = office.drawPos(a);
      const p = iso(at.x, at.y);
      v.g.setAttribute('transform', `translate(${p.sx.toFixed(1)},${p.sy.toFixed(1)}) scale(${CHAR_SCALE})`);
      this.draw(v, a, office, now, p.sx, p.sy);
      this.place(v, depthOf(at.x, at.y) + 0.3);

      const pose = office.poseOf(a, now);
      const sweat = a.sweatUntil > now;
      const cls = `char char-${a.role} pose-${pose}${sweat ? ' sweating' : ''}${a.phase === 'gone' || office.waiting(a, now) ? ' gone' : ''}`;
      if (cls !== v.pose) {
        v.pose = cls;
        v.g.setAttribute('class', cls);
      }
      const bk = a.bubble ? `${a.bubble.kind}|${a.bubble.text}` : '';
      if (bk !== v.bubbleKey) {
        v.bubbleKey = bk;
        v.bubble.className = a.bubble ? `bubble bubble-${a.bubble.kind} show` : 'bubble';
        v.bubble.innerHTML = a.bubble ? esc(a.bubble.text) : '';
      }
    }

    const ub = office.userBubble;
    const ubText = ub ? `💬 ${ub.text}` : '';
    if (this.userBubble.textContent !== ubText) {
      this.userBubble.textContent = ubText;
      this.userBubble.className = ub ? 'bubble user-bubble bubble-user show' : 'bubble user-bubble';
    }

    const cl = this.svg.classList;
    cl.toggle('dev-busy', office.busy('dev'));
    cl.toggle('server-busy', office.busy('server'));
    cl.toggle('git-busy', office.gitBusy());
    cl.toggle('search-busy', office.busy('search'));
    cl.toggle('library-busy', office.busy('library'));
    cl.toggle('phone-busy', [...office.agents.values()].some((a) => a.cur?.kind === 'phone' && !a.cur.done));
    cl.toggle('elevator-open', office.elevatorOpenUntil > now);
    this.elevInd.textContent = office.elevatorOpenUntil > now ? `▼ ${this.floorLabel}` : this.floorLabel;

    const key = office.board.join('\n');
    if (key !== this.boardKey) {
      this.boardKey = key;
      this.boardLines.innerHTML = office.board
        .map((line, i) => {
          const t = line.length > 24 ? line.slice(0, 23) + '…' : line;
          return `<text x="6" y="${19 + i * 6.4}" class="wb-line">${esc(t)}</text>`;
        })
        .join('');
    }
  }
}
