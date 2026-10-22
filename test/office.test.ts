import { describe, expect, it } from 'vitest';
import type { OfficeEvent } from '../shared/events.ts';
import { ROOMS, rectOf } from '../src/layout.ts';
import { Office, type Agent } from '../src/state/office.ts';

const SUB = 'toolu_sub';

function roomAt(a: Agent): string | null {
  for (const [k, r] of Object.entries(ROOMS)) {
    if (a.pos.x >= r.x && a.pos.x <= r.x + r.w && a.pos.y >= r.y && a.pos.y <= r.y + r.d) return k;
  }
  return null;
}

/** 이벤트를 시간대로 넣으면서 50ms씩 진행하고, 매 틱마다 관찰한다 */
function run(office: Office, timeline: [number, OfficeEvent][], until: number, watch: (now: number) => void) {
  let i = 0;
  for (let now = 0; now <= until; now += 50) {
    while (i < timeline.length && timeline[i][0] <= now) office.apply(timeline[i++][1], now);
    office.tick(now, 50);
    office.sweep(now);
    watch(now);
  }
}

type NoTs<E> = E extends OfficeEvent ? Omit<E, 'ts'> : never;
const ev = (e: NoTs<OfficeEvent>) => ({ ts: 0, ...e }) as OfficeEvent;

describe('Office', () => {
  it('툴을 쓰면 그 방으로 걸어간다', () => {
    const o = new Office();
    const seen = new Set<string | null>();
    run(
      o,
      [
        [0, ev({ k: 'tool', agent: 'main', id: 'r1', name: 'Read', room: 'library', label: 'a.ts' })],
        [100, ev({ k: 'toolDone', agent: 'main', id: 'r1', error: false })],
        [200, ev({ k: 'tool', agent: 'main', id: 'b1', name: 'Bash', room: 'server', label: 'ls' })],
      ],
      25000,
      () => seen.add(o.main.path.length ? null : roomAt(o.main)),
    );
    expect(seen).toContain('library');
    expect(roomAt(o.main)).toBe('server');
    expect(o.poseOf(o.main, 25000)).toBe('operate');
  });

  it('서브에이전트: 엘리베이터로 출근 → 일 → 보고 → 퇴근', () => {
    const o = new Office();
    const phases = new Set<string>();
    const rooms = new Set<string | null>();
    run(
      o,
      [
        [0, ev({ k: 'tool', agent: 'main', id: SUB, name: 'Agent', room: 'desk', label: 'Agent' })],
        [0, ev({ k: 'spawn', agent: 'main', toolUseId: SUB, subagentType: 'Explore', description: '찾기' })],
        [300, ev({ k: 'toolDone', agent: 'main', id: SUB, error: false, async: true })],
        [800, ev({ k: 'tool', agent: SUB, id: 'g1', name: 'Glob', room: 'library', label: '*.ts' })],
        [1200, ev({ k: 'toolDone', agent: SUB, id: 'g1', error: false })],
        [1500, ev({ k: 'tool', agent: SUB, id: 'r2', name: 'Read', room: 'library', label: 'x.ts' })],
        [1700, ev({ k: 'toolDone', agent: SUB, id: 'r2', error: false })],
        [6000, ev({ k: 'turnEnd', agent: SUB })],
        [6100, ev({ k: 'agentDone', agent: 'main', toolUseId: SUB })],
      ],
      40000,
      () => {
        const s = o.agents.get(SUB);
        if (!s) return;
        phases.add(s.phase);
        if (!s.path.length) rooms.add(rectOf(s.cur?.room ?? 'desk') === roomAt(s) ? roomAt(s) : null);
      },
    );
    expect(rooms).toContain('library');
    expect([...phases]).toEqual(expect.arrayContaining(['arriving', 'working', 'reporting', 'leaving']));
    expect(o.agents.has(SUB)).toBe(false);
  });

  it('보고하러 가다가 일을 또 받으면 다시 일하러 간다', () => {
    const o = new Office();
    let backToWork = false;
    run(
      o,
      [
        [0, ev({ k: 'spawn', agent: 'main', toolUseId: SUB, subagentType: 'Plan', description: '' })],
        [500, ev({ k: 'agentDone', agent: 'main', toolUseId: SUB })],
        [2500, ev({ k: 'tool', agent: SUB, id: 'e1', name: 'Edit', room: 'dev', label: 'a.ts' })],
      ],
      12000,
      (now) => {
        const s = o.agents.get(SUB);
        if (now > 2500 && s?.phase === 'working') backToWork = true;
      },
    );
    expect(backToWork).toBe(true);
    expect(roomAt(o.agents.get(SUB)!)).toBe('dev');
  });

  it('에러면 식은땀 + 빨간 말풍선', () => {
    const o = new Office();
    o.apply(ev({ k: 'tool', agent: 'main', id: 'b', name: 'Bash', room: 'server', label: 'x' }), 0);
    o.apply(ev({ k: 'toolDone', agent: 'main', id: 'b', error: true, errText: 'exit 1' }), 10);
    expect(o.main.sweatUntil).toBeGreaterThan(10);
    expect(o.main.bubble).toMatchObject({ kind: 'error', text: 'exit 1' });
  });

  it('재생 후 snap: 끝난 서브에이전트는 사라지고 메인은 마지막 방에 있다', () => {
    const o = new Office();
    o.apply(ev({ k: 'spawn', agent: 'main', toolUseId: SUB, subagentType: 'Explore', description: '' }), 0);
    o.apply(ev({ k: 'agentDone', agent: 'main', toolUseId: SUB }), 10);
    o.apply(ev({ k: 'tool', agent: 'main', id: 'w', name: 'WebSearch', room: 'search', label: 'q' }), 20);
    o.snap(100);
    expect(o.agents.has(SUB)).toBe(false);
    expect(roomAt(o.main)).toBe('search');
  });

  it('여럿이 같은 방에 가도 자리가 겹치지 않고, 엘리베이터에서 차례로 내린다', () => {
    const o = new Office();
    const keys = ['a', 'b', 'c', 'd'];
    const timeline: [number, OfficeEvent][] = keys.flatMap((k): [number, OfficeEvent][] => [
      [0, ev({ k: 'spawn', agent: 'main', toolUseId: k, subagentType: 'Explore', description: '' })],
      [0, ev({ k: 'tool', agent: k, id: `t-${k}`, name: 'Edit', room: 'dev', label: 'x' })],
    ]);
    let minWalkGap = Infinity;
    run(o, timeline, 15000, (now) => {
      const out = keys.map((k) => o.agents.get(k)!).filter((a) => !o.waiting(a, now));
      for (let i = 0; i < out.length; i++)
        for (let j = i + 1; j < out.length; j++) {
          const p = o.drawPos(out[i]);
          const q = o.drawPos(out[j]);
          minWalkGap = Math.min(minWalkGap, Math.hypot(p.x - q.x, p.y - q.y));
        }
    });
    const departs = keys.map((k) => o.agents.get(k)!.departAt);
    expect(new Set(departs).size).toBe(keys.length);
    const spots = keys.map((k) => o.agents.get(k)!.pos);
    for (let i = 0; i < spots.length; i++)
      for (let j = i + 1; j < spots.length; j++) expect(Math.hypot(spots[i].x - spots[j].x, spots[i].y - spots[j].y)).toBeGreaterThan(0.5);
    expect(keys.every((k) => roomAt(o.agents.get(k)!) === 'dev')).toBe(true);
    expect(minWalkGap).toBeGreaterThan(0.3);
  });
});
