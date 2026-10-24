import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { editsFromText, findCollisions, type Editor } from '../server/collisions.ts';

const now = Date.parse('2026-10-24T05:00:00Z');
const at = (minAgo: number) => new Date(now - minAgo * 60_000).toISOString();
const edit = (file: string, minAgo: number, name = 'Edit') =>
  JSON.stringify({
    type: 'assistant',
    timestamp: at(minAgo),
    message: { content: [{ type: 'tool_use', id: 'x', name, input: { file_path: file } }] },
  });
const editor = (dir: string, id: string, agent: string, lines: string[]): Editor => ({
  dir,
  id,
  agent,
  edits: editsFromText(lines.join('\n')),
});

describe('editsFromText', () => {
  it('Edit/Write만 뽑고 깨진 줄과 다른 도구는 건너뛴다', () => {
    const read = JSON.stringify({
      type: 'assistant',
      timestamp: at(1),
      message: { content: [{ type: 'tool_use', id: 'r', name: 'Read', input: { file_path: '/r.ts' } }] },
    });
    const edits = editsFromText(['{"type":"tool_use" broken', edit('/a.ts', 1), read, edit('/b.ts', 2, 'Write')].join('\n'));
    expect(edits.map((e) => e.path)).toEqual([path.resolve('/a.ts'), path.resolve('/b.ts')]);
  });
});

describe('findCollisions', () => {
  it('두 세션이 같은 파일을 고치면 충돌', () => {
    const list = findCollisions(
      [editor('p', 's1', 'main', [edit('/a.ts', 2)]), editor('q', 's2', 'main', [edit('/a.ts', 1)])],
      now,
    );
    expect(list).toHaveLength(1);
    expect(list[0].editors.map((e) => e.id)).toEqual(['s1', 's2']);
  });

  it('한 세션이 두 번 고친 건 충돌이 아니다', () => {
    expect(findCollisions([editor('p', 's1', 'main', [edit('/a.ts', 2), edit('/a.ts', 1)])], now)).toEqual([]);
  });

  it('창(10분) 밖의 수정은 무시한다', () => {
    const list = findCollisions(
      [editor('p', 's1', 'main', [edit('/a.ts', 30)]), editor('q', 's2', 'main', [edit('/a.ts', 1)])],
      now,
    );
    expect(list).toEqual([]);
  });

  it('한 세션의 서브에이전트 둘이 같은 파일을 고치면 충돌', () => {
    const list = findCollisions(
      [editor('p', 's1', 'toolu_a', [edit('/a.ts', 2)]), editor('p', 's1', 'toolu_b', [edit('/a.ts', 1)])],
      now,
    );
    expect(list).toHaveLength(1);
  });

  it('메인이 자기 서브에이전트가 고친 파일을 손보는 건 충돌이 아니다', () => {
    const list = findCollisions(
      [editor('p', 's1', 'toolu_a', [edit('/a.ts', 2)]), editor('p', 's1', 'main', [edit('/a.ts', 1)])],
      now,
    );
    expect(list).toEqual([]);
  });
});
