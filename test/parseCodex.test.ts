import { describe, expect, it } from 'vitest';
import { editsFromText } from '../server/collisions.ts';
import { parseCodexLine, patchFiles } from '../server/parseCodex.ts';

// agent-tail 어댑터와 실제 rollout(codex-cli 0.163)의 모양을 줄인 픽스처
const timestamp = '2026-10-24T05:00:00.000Z';
const item = (payload: object) => JSON.stringify({ timestamp, type: 'response_item', payload });
const patch = '*** Begin Patch\n*** Update File: src/App.ts\n@@\n-a\n+b\n*** Add File: src/new.ts\n+x\n*** End Patch';

describe('parseCodexLine', () => {
  it('사용자 입력만 prompt로, 주입 문구는 건너뛴다', () => {
    const real = item({
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text: 'report the current progress' }],
      internal_chat_message_metadata_passthrough: { content_item_kinds: ['user.text'] },
    });
    const injected = item({
      type: 'message',
      role: 'user',
      content: [
        { type: 'input_text', text: '# AGENTS.md instructions' },
        { type: 'input_text', text: '<environment_context>' },
      ],
      internal_chat_message_metadata_passthrough: { content_item_kinds: ['agents_md.instructions', 'environments.environment_context'] },
    });
    const old = item({ type: 'message', role: 'user', content: [{ type: 'input_text', text: '<user_instructions>x' }] });
    expect(parseCodexLine(real)).toMatchObject([{ k: 'prompt', text: 'report the current progress' }]);
    expect(parseCodexLine(injected)).toEqual([]);
    expect(parseCodexLine(old)).toEqual([]);
    expect(parseCodexLine(item({ type: 'message', role: 'developer', content: [{ text: 'x' }] }))).toEqual([]);
  });

  it('assistant 메시지는 say, reasoning 요약은 think', () => {
    expect(parseCodexLine(item({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Done.' }] }))).toMatchObject([
      { k: 'say', text: 'Done.' },
    ]);
    expect(parseCodexLine(item({ type: 'reasoning', summary: [{ type: 'summary_text', text: 'Checking files' }] }))).toMatchObject([
      { k: 'think', text: 'Checking files' },
    ]);
  });

  it('shell 호출은 서버실, bash -lc 껍데기를 벗기고 git을 표시한다', () => {
    const [ev] = parseCodexLine(
      item({ type: 'function_call', name: 'shell', call_id: 'c1', arguments: JSON.stringify({ command: ['bash', '-lc', 'git status'] }) }),
    );
    expect(ev).toMatchObject({ k: 'tool', id: 'c1', name: 'Bash', room: 'server', label: 'git status', git: true });
    const [ex] = parseCodexLine(item({ type: 'function_call', name: 'exec_command', call_id: 'c2', arguments: JSON.stringify({ cmd: 'ls -la' }) }));
    expect(ex).toMatchObject({ room: 'server', label: 'ls -la' });
  });

  it('apply_patch는 개발실 Edit, 라벨은 파일 이름', () => {
    const [ev] = parseCodexLine(item({ type: 'custom_tool_call', name: 'apply_patch', call_id: 'c3', input: patch }));
    expect(ev).toMatchObject({ k: 'tool', name: 'Edit', room: 'dev', label: 'App.ts, new.ts' });
  });

  it('출력은 toolDone, 0이 아닌 종료 코드는 에러', () => {
    const ok = item({ type: 'function_call_output', call_id: 'c1', output: JSON.stringify({ output: 'clean', metadata: { exit_code: 0 } }) });
    const bad = item({ type: 'function_call_output', call_id: 'c2', output: JSON.stringify({ output: 'boom', metadata: { exit_code: 2 } }) });
    expect(parseCodexLine(ok)).toMatchObject([{ k: 'toolDone', id: 'c1', error: false }]);
    expect(parseCodexLine(bad)).toMatchObject([{ k: 'toolDone', id: 'c2', error: true, errText: 'boom' }]);
  });

  it('task_complete는 턴 끝, 모르는 줄은 무시', () => {
    expect(parseCodexLine(JSON.stringify({ timestamp, type: 'event_msg', payload: { type: 'task_complete' } }))).toMatchObject([
      { k: 'turnEnd' },
    ]);
    expect(parseCodexLine(JSON.stringify({ timestamp, type: 'world_state', payload: { full: true } }))).toEqual([]);
    expect(parseCodexLine('not json')).toEqual([]);
  });

  it('명령 속 비밀값은 가린다', () => {
    const [ev] = parseCodexLine(
      item({ type: 'local_shell_call', call_id: 'c4', action: { command: ['bash', '-lc', 'export API_KEY=abc123 && run'] } }),
    );
    expect((ev as { label: string }).label).toContain('API_KEY=[REDACTED]');
  });
});

describe('codex 패치와 충돌 감지', () => {
  it('patchFiles는 경로를 뽑는다', () => {
    expect(patchFiles(patch)).toEqual(['src/App.ts', 'src/new.ts']);
  });

  it('editsFromText가 apply_patch 경로를 cwd 기준으로 푼다', () => {
    const edits = editsFromText(item({ type: 'custom_tool_call', name: 'apply_patch', call_id: 'c3', input: patch }), '/repo');
    expect(edits.map((e) => e.path)).toEqual(['/repo/src/App.ts', '/repo/src/new.ts']);
  });
});
