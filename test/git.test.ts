import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { gitSnapshot } from '../server/git.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'panoptes-git-'));
const run = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('gitSnapshot', () => {
  it('저장소가 아니면 null', async () => {
    expect(await gitSnapshot(dir)).toBeNull();
    expect(await gitSnapshot(path.join(dir, 'nope'))).toBeNull();
  });

  it('브랜치, 미커밋 수, 마지막 커밋을 읽는다', async () => {
    run('init', '-q', '-b', 'trunk');
    fs.writeFileSync(path.join(dir, 'a.txt'), 'a');
    run('add', 'a.txt');
    run('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'first commit');
    fs.writeFileSync(path.join(dir, 'b.txt'), 'b');
    const g = await gitSnapshot(dir);
    expect(g).toMatchObject({ branch: 'trunk', dirty: 1, ahead: 0, behind: 0, head: { subject: 'first commit' } });
    expect(g?.head?.sha).toHaveLength(7);
  });
});
