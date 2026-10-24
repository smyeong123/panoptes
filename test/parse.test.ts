import { describe, expect, it } from 'vitest';
import { parseLine } from '../server/parse.ts';

// 실제 jsonl 레코드 모양을 줄여서 익명화한 픽스처
const ts = '2026-10-19T02:10:36.386Z';
const asst = (content: unknown[], extra: object = {}) =>
  JSON.stringify({ type: 'assistant', timestamp: ts, message: { role: 'assistant', content, ...extra } });
const user = (content: unknown, extra: object = {}) =>
  JSON.stringify({ type: 'user', timestamp: ts, message: { role: 'user', content }, ...extra });

describe('parseLine', () => {
  it('tool_use를 방으로 보낸다', () => {
    const [ev] = parseLine(asst([{ type: 'tool_use', id: 't1', name: 'Read', input: { file_path: 'C:\\a\\b\\App.vue' } }]));
    expect(ev).toMatchObject({ k: 'tool', id: 't1', room: 'library', label: 'App.vue', agent: 'main' });
  });

  it('git 명령은 서버실 + git 표시', () => {
    const [ev] = parseLine(asst([{ type: 'tool_use', id: 't2', name: 'Bash', input: { command: 'cd x && git status' } }]));
    expect(ev).toMatchObject({ room: 'server', git: true });
  });

  it('mcp 도구는 정보검색실', () => {
    const [ev] = parseLine(asst([{ type: 'tool_use', id: 't3', name: 'mcp__chrome-devtools__click', input: {} }]));
    expect(ev).toMatchObject({ room: 'search', label: 'chrome-devtools · click' });
  });

  it('TodoWrite는 화이트보드 줄을 만든다', () => {
    const [ev] = parseLine(
      asst([
        {
          type: 'tool_use',
          id: 't4',
          name: 'TodoWrite',
          input: { todos: [{ content: '파서', status: 'completed' }, { content: '렌더', status: 'in_progress' }] },
        },
      ]),
    );
    expect(ev).toMatchObject({ room: 'meeting', board: ['✔ 파서', '▶ 렌더'] });
  });

  it('비어 있는 thinking도 생각 이벤트가 된다', () => {
    const [ev] = parseLine(asst([{ type: 'thinking', thinking: '', signature: 'x' }]));
    expect(ev).toMatchObject({ k: 'think', text: '' });
  });

  it('에러 tool_result', () => {
    const [ev] = parseLine(user([{ type: 'tool_result', tool_use_id: 't2', is_error: true, content: 'exit 1\nnope' }]));
    expect(ev).toMatchObject({ k: 'toolDone', id: 't2', error: true, errText: 'exit 1 nope' });
  });

  it('Agent는 spawn을 함께 낸다', () => {
    const evs = parseLine(
      asst([{ type: 'tool_use', id: 'ta', name: 'Agent', input: { subagent_type: 'Explore', description: '찾기' } }]),
    );
    expect(evs.map((e) => e.k)).toEqual(['tool', 'spawn']);
    expect(evs[1]).toMatchObject({ toolUseId: 'ta', subagentType: 'Explore', description: '찾기' });
  });

  it('비동기 실행 결과에는 async 표시', () => {
    const [ev] = parseLine(
      user([{ type: 'tool_result', tool_use_id: 'ta', content: [{ type: 'text', text: 'Async agent launched' }] }], {
        toolUseResult: { isAsync: true, status: 'async_launched', agentId: 'abc' },
      }),
    );
    expect(ev).toMatchObject({ k: 'toolDone', id: 'ta', async: true, error: false });
  });

  it('task-notification(queue-operation)은 agentDone', () => {
    const line = JSON.stringify({
      type: 'queue-operation',
      operation: 'enqueue',
      timestamp: ts,
      content: '<task-notification>\n<task-id>abc</task-id>\n<tool-use-id>ta</tool-use-id>\n<status>completed</status>\n</task-notification>',
    });
    expect(parseLine(line)).toEqual([{ k: 'agentDone', ts: Date.parse(ts), agent: 'main', toolUseId: 'ta' }]);
  });

  it('팀메이트 spawn 결과는 async + teammate 연결', () => {
    const evs = parseLine(
      user([{ type: 'tool_result', tool_use_id: 'ta', content: [{ type: 'text', text: 'Spawned successfully.' }] }], {
        toolUseResult: { status: 'teammate_spawned', agentId: 'atest-01-abc', name: 'test-01' },
      }),
    );
    expect(evs).toMatchObject([
      { k: 'teammate', toolUseId: 'ta', agentId: 'atest-01-abc', name: 'test-01' },
      { k: 'toolDone', id: 'ta', async: true },
    ]);
  });

  it('teammate-message의 idle_notification은 teammateIdle', () => {
    const idle = (from: string) =>
      `<teammate-message teammate_id="${from}" color="blue">\n${JSON.stringify({ type: 'idle_notification', from, timestamp: ts, idleReason: 'available' })}\n</teammate-message>`;
    const text =
      'Another Claude session sent a message:\n' +
      idle('test-01') +
      '\n\n<teammate-message teammate_id="test-02" color="green" summary="x">\nplain reply\n</teammate-message>\n\n' +
      idle('test-02');
    expect(parseLine(user(text))).toEqual([
      { k: 'teammateIdle', ts: Date.parse(ts), agent: 'main', name: 'test-01' },
      { k: 'teammateIdle', ts: Date.parse(ts), agent: 'main', name: 'test-02' },
    ]);
  });

  it('슬래시 명령·메타·요약은 프롬프트가 아니다', () => {
    expect(parseLine(user('<command-name>/clear</command-name>'))).toEqual([]);
    expect(parseLine(user('hi', { isMeta: true }))).toEqual([]);
    expect(parseLine(user('This session is being continued from a previous conversation'))).toEqual([]);
    expect(parseLine(user('사무실 만들어줘'))).toMatchObject([{ k: 'prompt', text: '사무실 만들어줘' }]);
  });

  it('서브에이전트의 end_turn은 턴 끝, 프롬프트는 무시', () => {
    const evs = parseLine(asst([{ type: 'text', text: '결과입니다' }], { stop_reason: 'end_turn' }), 'ta');
    expect(evs.map((e) => e.k)).toEqual(['say', 'turnEnd']);
    expect(parseLine(user('READ-ONLY task'), 'ta')).toEqual([]);
  });

  it('turn_duration은 턴 끝, 잡음은 버린다', () => {
    expect(parseLine(JSON.stringify({ type: 'system', subtype: 'turn_duration', timestamp: ts }))).toMatchObject([{ k: 'turnEnd' }]);
    expect(parseLine(JSON.stringify({ type: 'attachment' }))).toEqual([]);
    expect(parseLine('{broken')).toEqual([]);
  });
});
