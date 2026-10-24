import type { FloorInfo, GitInfo, SessionInfo } from '../../shared/events.ts';
import { t } from '../i18n.ts';
import { esc } from './iso.ts';

const ORDER_KEY = 'rto.floorOrder';
export const ACTIVE_MS = 15_000;

function load(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(ORDER_KEY) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function save(order: string[]) {
  try {
    localStorage.setItem(ORDER_KEY, JSON.stringify(order));
  } catch {
    // 저장 못 해도 이번 화면에서는 순서가 유지된다
  }
}

export function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return t('ago.now');
  if (s < 3600) return t('ago.min', { n: Math.floor(s / 60) });
  if (s < 86400) return t('ago.hour', { n: Math.floor(s / 3600) });
  return t('ago.day', { n: Math.floor(s / 86400) });
}

export function isActive(s: SessionInfo, now: number): boolean {
  return now - s.mtime < ACTIVE_MS;
}

/** ⎇ 브랜치 · ●미커밋 · ↑ahead ↓behind (0인 항목은 뺀다) */
export function gitSummary(g: GitInfo): string {
  const parts = [`⎇ ${g.branch}`];
  if (g.dirty) parts.push(`●${g.dirty}`);
  const ab = [g.ahead ? `↑${g.ahead}` : '', g.behind ? `↓${g.behind}` : ''].filter(Boolean).join(' ');
  if (ab) parts.push(ab);
  return parts.join(' · ');
}

function gitLine(g: GitInfo | undefined): string {
  if (!g) return '';
  const title = g.head ? `${g.head.sha} ${g.head.subject}` : '';
  return `<div class="floor-git${g.dirty ? ' dirty' : ''}" title="${esc(title)}">${esc(gitSummary(g))}</div>`;
}

/** 처음 본 순서대로 1F, 2F… 층 번호를 고정한다. 처음엔 오래된 프로젝트가 아래층. */
export class FloorNumbers {
  private order = load();

  assign(floors: FloorInfo[]) {
    const known = new Set(this.order);
    const fresh = floors.filter((f) => !known.has(f.dir)).sort((a, b) => a.mtime - b.mtime);
    if (fresh.length) {
      this.order.push(...fresh.map((f) => f.dir));
      save(this.order);
    }
  }

  of(dir: string): number {
    return this.order.indexOf(dir) + 1;
  }
}

export interface DirectoryHandlers {
  onFloor(dir: string): void;
  onStore(dir: string, id: string): void;
}

/** 왼쪽 층별 안내판 */
export class Directory {
  constructor(
    private host: HTMLElement,
    private nums: FloorNumbers,
    private h: DirectoryHandlers,
  ) {
    host.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const store = t.closest<HTMLElement>('[data-store]');
      if (store) return this.h.onStore(store.dataset.dir!, store.dataset.store!);
      const floor = t.closest<HTMLElement>('[data-floor]');
      if (floor) this.h.onFloor(floor.dataset.floor!);
    });
  }

  render(floors: FloorInfo[], current: { dir: string; id: string } | null, now: number) {
    const list = [...floors].sort((a, b) => this.nums.of(b.dir) - this.nums.of(a.dir));
    this.host.innerHTML = `
      <div class="dir-head"><span class="dir-logo">🏢</span><div><b>FLOOR GUIDE</b><small>${t('dir.subtitle')}</small></div></div>
      <ol class="floors">${list
        .map((f) => {
          const here = current?.dir === f.dir;
          const live = f.sessions.some((s) => isActive(s, now));
          const stores = here
            ? `<ul class="stores">${f.sessions
                .map(
                  (s) => `<li data-dir="${esc(f.dir)}" data-store="${esc(s.id)}" class="store${current?.id === s.id ? ' current' : ''}${isActive(s, now) ? ' live' : ''}">
                    <span class="store-dot"></span><span class="store-name">${esc(s.title || s.id.slice(0, 8))}</span><span class="store-ago">${ago(now - s.mtime)}</span></li>`,
                )
                .join('')}</ul>`
            : '';
          return `<li class="floor${here ? ' here' : ''}${live ? ' live' : ''}" data-floor="${esc(f.dir)}" title="${esc(f.cwd || f.dir)}">
            <div class="floor-row"><span class="fl">${this.nums.of(f.dir)}F</span><span class="floor-name">${esc(f.name)}</span>
            <span class="lamp"></span><span class="count">${f.sessions.length}</span></div>${gitLine(f.git)}${stores}</li>`;
        })
        .join('')}</ol>`;
  }
}
