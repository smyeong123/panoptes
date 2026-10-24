// 서버(jsonl 파서)와 브라우저(사무실 상태 기계)가 주고받는 이벤트.
// 에이전트 키: 메인 Claude는 'main', 서브에이전트는 자기를 띄운 Agent tool_use id.

export type Room = 'library' | 'dev' | 'server' | 'search' | 'meeting' | 'user' | 'desk';

interface Base {
  ts: number;
  agent: string;
}

export type OfficeEvent =
  | (Base & { k: 'tool'; id: string; name: string; room: Room; label: string; git?: boolean; board?: string[] })
  | (Base & { k: 'toolDone'; id: string; error: boolean; errText?: string; async?: boolean })
  | (Base & { k: 'think'; text: string })
  | (Base & { k: 'say'; text: string })
  | (Base & { k: 'prompt'; text: string })
  | (Base & { k: 'turnEnd' })
  | (Base & { k: 'spawn'; toolUseId: string; subagentType: string; description: string })
  | (Base & { k: 'agentDone'; toolUseId: string })
  // 팀메이트로 뜬 서브에이전트: 기록 파일 키(agent:<agentId>)와 이름을 spawn id에 잇는다
  | (Base & { k: 'teammate'; toolUseId: string; agentId: string; name: string })
  | (Base & { k: 'teammateIdle'; name: string });

export type SessionSource = 'claude' | 'codex';

export interface SessionInfo {
  id: string;
  title: string;
  mtime: number;
  size: number;
  source?: SessionSource;
}

export interface GitInfo {
  branch: string;
  dirty: number;
  ahead: number;
  behind: number;
  head: { sha: string; subject: string } | null;
}

export interface FloorInfo {
  dir: string;
  name: string;
  cwd: string;
  mtime: number;
  sessions: SessionInfo[];
  git?: GitInfo;
}

/** 창 안에서 같은 파일을 고친 편집자들. agent는 'main' 또는 서브에이전트 키. */
export interface Collision {
  path: string;
  editors: { dir: string; id: string; agent: string; ts: number }[];
}

export type ServerMessage =
  | { t: 'floors'; floors: FloorInfo[] }
  | { t: 'collisions'; list: Collision[] }
  | { t: 'replay'; session: string; events: OfficeEvent[]; source?: SessionSource }
  | { t: 'events'; session: string; events: OfficeEvent[] };
