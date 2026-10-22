import type { FloorInfo, ServerMessage } from '../shared/events.ts';
import { ago, Directory, FloorNumbers, isActive } from './render/directory.ts';
import { Scene } from './render/scene.ts';
import { Office } from './state/office.ts';
import { initTheme } from './theme.ts';
import './styles.css';

interface Current {
  dir: string;
  id: string;
}

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

initTheme();

const office = new Office();
const scene = new Scene($('#stage'));
const nums = new FloorNumbers();
let floors: FloorInfo[] = [];
let current: Current | null = null;
let pinned = false;
let es: EventSource | null = null;
let moving = false;

const directory = new Directory($('#directory'), nums, {
  onFloor: (dir) => {
    if (dir === current?.dir) return;
    const f = floors.find((x) => x.dir === dir);
    if (f?.sessions[0]) ride({ dir, id: f.sessions[0].id }, false);
  },
  onStore: (dir, id) => {
    if (dir === current?.dir && id === current.id) {
      pinned = !pinned;
      hud();
      return;
    }
    ride({ dir, id }, true);
  },
});

function floorOf(dir: string | undefined) {
  return floors.find((f) => f.dir === dir);
}

function connect(session: Current | null) {
  es?.close();
  const url = session ? `/api/stream?session=${encodeURIComponent(`${session.dir}/${session.id}`)}` : '/api/stream';
  es = new EventSource(url);
  es.onopen = () => $('#conn').classList.remove('off');
  es.onerror = () => $('#conn').classList.add('off');
  es.onmessage = (e) => onMessage(JSON.parse(e.data) as ServerMessage);
}

function key(c: Current | null) {
  return c ? `${c.dir}/${c.id}` : '';
}

function onMessage(msg: ServerMessage) {
  if (msg.t === 'floors') {
    floors = msg.floors;
    nums.assign(floors);
    if (!current) {
      const remembered = lastViewed();
      const start = floorOf(remembered?.dir) ?? [...floors].sort((a, b) => b.mtime - a.mtime)[0];
      if (start?.sessions[0]) switchTo({ dir: start.dir, id: start.sessions[0].id }, false);
    } else {
      follow();
    }
    refreshDirectory();
    return;
  }
  if (msg.session !== key(current)) return;
  if (msg.t === 'replay') {
    office.reset();
    scene.clearCharacters();
    for (const ev of msg.events) office.apply(ev, ev.ts);
    office.snap(Date.now());
    return;
  }
  const now = Date.now();
  for (const ev of msg.events) office.apply(ev, now);
}

/** /clear 등으로 같은 층에 새 세션이 생겨 움직이기 시작하면 그쪽으로 따라간다 */
function follow() {
  if (pinned || !current || moving) return;
  const f = floorOf(current.dir);
  if (!f) return;
  const now = Date.now();
  const cur = f.sessions.find((s) => s.id === current!.id);
  const latest = f.sessions[0];
  if (!latest || latest.id === current.id || !isActive(latest, now)) return;
  if (cur && cur.mtime >= latest.mtime) return;
  toast('🚪 새 세션이 열려서 따라갑니다');
  switchTo({ dir: f.dir, id: latest.id }, false);
}

const LAST_KEY = 'rto.lastFloor';

function lastViewed(): { dir: string } | null {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) ?? 'null');
  } catch {
    return null;
  }
}

function switchTo(next: Current, pin: boolean) {
  current = next;
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify({ dir: next.dir }));
  } catch {
    // 기억 못 해도 동작에는 지장 없음
  }
  pinned = pin;
  scene.setFloorLabel(`${nums.of(next.dir)}F`);
  connect(next);
  hud();
  refreshDirectory();
}

/** 다른 층이면 엘리베이터를 타고 이동한다 */
function ride(next: Current, pin: boolean) {
  if (moving) return;
  const from = current ? nums.of(current.dir) : 1;
  const to = nums.of(next.dir);
  if (!current || from === to) return switchTo(next, pin);
  moving = true;
  const arrow = to > from ? '▲' : '▼';
  const ind = $('#elevator-ind');
  const stage = $('#stage');
  ind.classList.add('moving');
  stage.classList.add('riding', to > from ? 'up' : 'down');
  const steps = Math.min(Math.abs(to - from), 8);
  ind.textContent = `${arrow} ${from}F`;
  let i = 0;
  const timer = setInterval(() => {
    i++;
    const n = i >= steps ? to : Math.round(from + ((to - from) * i) / steps);
    ind.textContent = `${arrow} ${n}F`;
    if (i >= steps) {
      clearInterval(timer);
      switchTo(next, pin);
      setTimeout(() => {
        stage.classList.remove('riding', 'up', 'down');
        ind.classList.remove('moving');
        moving = false;
        hud();
      }, 350);
    }
  }, 900 / steps);
}

function hud() {
  const f = floorOf(current?.dir);
  const s = f?.sessions.find((x) => x.id === current?.id);
  if (!moving) $('#elevator-ind').textContent = current ? `${nums.of(current.dir)}F` : '—';
  $('#floor-name').textContent = f?.name ?? '사무실을 찾는 중…';
  $('#store-name').textContent = s ? `${s.title || s.id.slice(0, 8)} · ${ago(Date.now() - s.mtime)}` : '';
  const btn = $<HTMLButtonElement>('#pin');
  btn.textContent = pinned ? '📌 이 세션 고정' : '🔁 새 세션 따라가기';
  btn.classList.toggle('pinned', pinned);
}

function refreshDirectory() {
  directory.render(floors, current, Date.now());
  hud();
}

let toastTimer = 0;
function toast(text: string) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove('show'), 2600);
}

$('#pin').addEventListener('click', () => {
  pinned = !pinned;
  hud();
  if (!pinned) follow();
});

let last = performance.now();
function frame(t: number) {
  const dt = Math.min(100, t - last);
  last = t;
  const now = Date.now();
  office.tick(now, dt);
  office.sweep(now);
  scene.render(office, now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
setInterval(refreshDirectory, 5000);

connect(null);

if (import.meta.env.DEV) Object.assign(window, { __office: office });
