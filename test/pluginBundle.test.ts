import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import pkg from '../package.json' with { type: 'json' };

const repo = fileURLToPath(new URL('..', import.meta.url));
const committed = path.join(repo, 'plugin', 'dist');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'panoptes-plugin-'));

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

// Vitest가 넣는 환경 변수(NODE_ENV=test 등)가 섞이면 Vite가 평소와 다른 결과물을 만든다
const VITEST_ENV = ['NODE_ENV', 'MODE', 'DEV', 'PROD', 'SSR', 'TEST', 'BASE_URL'];
function cleanEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('VITEST') && !VITEST_ENV.includes(key)) env[key] = value;
  }
  return { ...env, ...extra };
}

function listFiles(dir: string, prefix = ''): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? listFiles(path.join(dir, e.name), `${prefix}${e.name}/`) : [prefix + e.name]))
    .sort();
}

function same(a: string, b: string): boolean {
  return fs.existsSync(a) && fs.existsSync(b) && fs.readFileSync(a).equals(fs.readFileSync(b));
}

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = net.createServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as net.AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

describe('plugin/dist', () => {
  it('소스로 다시 빌드한 것과 같다 (다르면 npm run build:plugin)', () => {
    const fresh = path.join(tmp, 'dist');
    execFileSync(process.execPath, ['scripts/build-plugin.mjs', '--out', fresh], {
      cwd: repo,
      env: cleanEnv(),
      stdio: 'pipe',
    });
    const files = [...new Set([...listFiles(fresh), ...listFiles(committed)])].sort();
    expect(files).toContain('panoptes.mjs');
    expect(files).toContain('web/index.html');
    const stale = files.filter((f) => !same(path.join(fresh, f), path.join(committed, f)));
    expect(stale, 'plugin/dist is stale. Run: npm run build:plugin').toEqual([]);
  }, 60_000);

  it('두 플러그인의 plugin.json 버전이 package.json과 같다', () => {
    for (const folder of ['plugin', 'plugin-directory']) {
      const manifest = JSON.parse(fs.readFileSync(path.join(repo, folder, '.claude-plugin', 'plugin.json'), 'utf8'));
      expect(manifest.version, folder).toBe(pkg.version);
    }
  });
});

describe('npm 패키지', () => {
  it('panoptes 명령이 실행 가능한 번들을 가리킨다', () => {
    expect(pkg.bin).toEqual({ panoptes: 'plugin/dist/panoptes.mjs' });
    const head = fs.readFileSync(path.join(repo, pkg.bin.panoptes), 'utf8').split('\n', 1)[0];
    expect(head).toBe('#!/usr/bin/env node');
  });

  it('빌드 결과물과 안내 문서만 담는다', () => {
    const out = execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
      cwd: repo,
      env: cleanEnv(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const [{ files }] = JSON.parse(out) as [{ files: { path: string }[] }];
    const packed = files.map((f) => f.path).sort();
    const extra = packed.filter((f) => !f.startsWith('plugin/dist/') && !['LICENSE', 'README.md', 'README.ko.md', 'package.json'].includes(f));
    expect(extra).toEqual([]);
    expect(packed).toContain('plugin/dist/panoptes.mjs');
    expect(packed).toContain('plugin/dist/web/index.html');
  }, 30_000);
});

describe('런처 (plugin/dist/panoptes.mjs)', () => {
  it('서버를 띄우고, 다시 부르면 그대로 쓰고, 끝낸다', async () => {
    const port = await freePort();
    const base = `http://127.0.0.1:${port}`;
    const env = cleanEnv({
      PANOPTES_PORT: String(port),
      // 테스트가 중간에 죽어도 서버가 남지 않게 한다
      PANOPTES_IDLE_MINUTES: '1',
      CLAUDE_PROJECTS_DIR: path.join(tmp, 'projects'),
      CODEX_HOME: path.join(tmp, 'codex'),
    });
    const run = (...args: string[]) =>
      execFileSync(process.execPath, [path.join(committed, 'panoptes.mjs'), ...args], { env, encoding: 'utf8' }).trim();
    const health = async () => (await (await fetch(`${base}/api/health`)).json()) as { version: string; pid: number };

    try {
      expect(run('status')).toBe(`Panoptes is not running at ${base}.`);
      expect(run('open', '--no-open')).toBe(`Panoptes is running at ${base}`);
      const first = await health();
      expect(first.version).toBe(pkg.version);
      expect(await (await fetch(base)).text()).toContain('<title>Panoptes</title>');

      expect(run('open', '--no-open')).toBe(`Panoptes is running at ${base}`);
      expect((await health()).pid).toBe(first.pid);
      expect(run('status')).toBe(`Panoptes ${pkg.version} is running at ${base}`);

      expect(run('stop')).toBe('Panoptes stopped.');
      await expect(fetch(`${base}/api/health`)).rejects.toThrow();
      expect(run('stop')).toBe(`Panoptes is not running at ${base}.`);
    } finally {
      try {
        run('stop');
      } catch {
        // 이미 끝났으면 됐다
      }
    }
  }, 30_000);
});
