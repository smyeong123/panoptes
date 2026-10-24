import { execFile } from 'node:child_process';
import fs from 'node:fs';
import type { GitInfo } from '../shared/events.ts';

// agent-tail(src/collector/git.ts)에서 가져와 층 안내판에 필요한 만큼만 남겼다.
// GIT_OPTIONAL_LOCKS=0: 사용자가 동시에 돌리는 git과 index lock을 다투지 않는다.
function git(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      { cwd, timeout: 5000, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C' } },
      (err, stdout) => (err ? reject(err) : resolve(stdout)),
    );
  });
}

/** 작업 폴더의 브랜치·미커밋 수·ahead/behind·마지막 커밋. 저장소가 아니면 null. */
export async function gitSnapshot(cwd: string): Promise<GitInfo | null> {
  if (!cwd || !fs.existsSync(cwd)) return null;
  let status: string;
  try {
    status = await git(cwd, ['status', '--porcelain=v2', '--branch', '--untracked-files=normal']);
  } catch {
    return null;
  }
  let branch = '';
  let sha = '';
  let ahead = 0;
  let behind = 0;
  let dirty = 0;
  for (const line of status.split('\n')) {
    if (!line) continue;
    if (!line.startsWith('# ')) {
      dirty++;
      continue;
    }
    const [key, ...rest] = line.slice(2).split(' ');
    if (key === 'branch.head') branch = rest.join(' ');
    else if (key === 'branch.oid') sha = rest[0] === '(initial)' ? '' : rest[0];
    else if (key === 'branch.ab') {
      ahead = Math.abs(Number(rest[0]) || 0);
      behind = Math.abs(Number(rest[1]) || 0);
    }
  }
  if (branch === '(detached)') branch = sha ? `detached@${sha.slice(0, 7)}` : 'detached';
  let subject = '';
  if (sha) {
    try {
      subject = (await git(cwd, ['log', '-1', '--format=%s'])).trim();
    } catch {
      // 커밋 제목이 없어도 나머지는 보여 준다
    }
  }
  return { branch, dirty, ahead, behind, head: sha ? { sha: sha.slice(0, 7), subject } : null };
}
