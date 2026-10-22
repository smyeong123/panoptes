import type { Room } from './events.ts';

const ROOM_BY_TOOL: Record<string, Room> = {
  Read: 'library',
  Grep: 'library',
  Glob: 'library',
  LS: 'library',
  NotebookRead: 'library',

  Edit: 'dev',
  Write: 'dev',
  MultiEdit: 'dev',
  NotebookEdit: 'dev',

  Bash: 'server',
  PowerShell: 'server',
  BashOutput: 'server',
  KillShell: 'server',
  KillBash: 'server',
  Monitor: 'server',
  TaskStop: 'server',
  TaskOutput: 'server',
  EnterWorktree: 'server',
  ExitWorktree: 'server',

  WebSearch: 'search',
  WebFetch: 'search',
  ToolSearch: 'search',
  ListMcpResourcesTool: 'search',
  ReadMcpResourceTool: 'search',

  TodoWrite: 'meeting',
  TaskCreate: 'meeting',
  TaskUpdate: 'meeting',
  TaskList: 'meeting',
  TaskGet: 'meeting',
  EnterPlanMode: 'meeting',
  Skill: 'meeting',

  AskUserQuestion: 'user',
  ExitPlanMode: 'user',

  Agent: 'desk',
  Task: 'desk',
  SendMessage: 'desk',
};

export function roomForTool(name: string): Room {
  if (name.startsWith('mcp__')) return 'search';
  return ROOM_BY_TOOL[name] ?? 'desk';
}

export const ROOM_LABEL: Record<Room, string> = {
  library: '📚 자료실',
  dev: '💻 개발실',
  server: '🗄️ 서버실',
  search: '🌐 정보검색실',
  meeting: '🗒️ 회의실',
  user: '🧑‍💻 내 자리',
  desk: 'Claude 자리',
};
