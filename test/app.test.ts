import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import pkg from '../package.json' with { type: 'json' };

// watcher는 import할 때 폴더 경로를 정하므로 env를 먼저 맞추고 불러온다
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'panoptes-app-'));
const webDir = path.join(root, 'web');
let app: typeof import('../server/app.ts');
let running: import('../server/app.ts').RunningServer;
let base: string;

const get = (urlPath: string) => fetch(base + urlPath);

/** fetch로는 Host 헤더를 바꿀 수 없어서 http로 직접 보낸다. 상태 코드만 받고 끊는다. */
function statusFor(port: number, urlPath: string, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: urlPath, headers: { Host: host } }, (res) => {
      resolve(res.statusCode ?? 0);
      res.destroy();
    });
    req.on('error', reject);
  });
}

beforeAll(async () => {
  process.env.CLAUDE_PROJECTS_DIR = path.join(root, 'projects');
  process.env.CODEX_HOME = path.join(root, 'codex');
  fs.mkdirSync(path.join(webDir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(webDir, 'index.html'), '<title>index</title>');
  fs.writeFileSync(path.join(webDir, 'assets', 'app.js'), 'console.log(1)');
  // webDir와 같은 글자로 시작하는 옆 폴더
  fs.mkdirSync(path.join(root, 'web-private'));
  fs.writeFileSync(path.join(root, 'web-private', 'secret.txt'), 'secret');
  app = await import('../server/app.ts');
  running = await app.startServer({ host: '127.0.0.1', port: 0, webDir });
  base = `http://127.0.0.1:${running.port}`;
});

afterAll(async () => {
  await running.close();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('startServer', () => {
  it('/api/health가 앱 이름, 버전, pid를 알려 준다', async () => {
    const res = await get('/api/health');
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({ app: 'panoptes', version: pkg.version, pid: process.pid });
  });

  it('파일을 서빙하고, 없는 경로는 index.html로 돌린다', async () => {
    const js = await get('/assets/app.js');
    expect(js.headers.get('content-type')).toContain('text/javascript');
    expect(await js.text()).toBe('console.log(1)');
    expect(await (await get('/')).text()).toBe('<title>index</title>');
    expect(await (await get('/no/such/page')).text()).toBe('<title>index</title>');
  });

  it('webDir 밖의 파일은 주지 않는다', async () => {
    expect(await (await get('/..%2fweb-private%2fsecret.txt')).text()).toBe('<title>index</title>');
    expect(await (await get('/..%2f..%2fweb-private%2fsecret.txt')).text()).toBe('<title>index</title>');
  });

  it('해석할 수 없는 주소는 400으로 답하고 계속 돈다', async () => {
    expect((await get('/%E0%A4%A')).status).toBe(400);
    expect((await get('//')).status).toBe(400);
    expect((await get('/api/health')).status).toBe(200);
  });

  it('다른 도메인 이름으로 온 요청은 어느 경로든 403', async () => {
    const foreign = `attacker.example:${running.port}`;
    for (const urlPath of ['/api/stream', '/api/stream?session=a/b', '/api/health', '/', '/assets/app.js']) {
      expect(await statusFor(running.port, urlPath, foreign), urlPath).toBe(403);
    }
    expect(await statusFor(running.port, '/api/stream', `localhost:${running.port}`)).toBe(200);
    expect(await statusFor(running.port, '/api/health', `[::1]:${running.port}`)).toBe(200);
  });
});

describe('resolveStatic', () => {
  it('폴더 안이면 경로를, 밖이면 null을 돌려준다', () => {
    expect(app.resolveStatic(webDir, '/')).toBe(path.join(webDir, 'index.html'));
    expect(app.resolveStatic(webDir, '/assets/app.js')).toBe(path.join(webDir, 'assets', 'app.js'));
    expect(app.resolveStatic(webDir, '/../web-private/secret.txt')).toBeNull();
    expect(app.resolveStatic(webDir, '/../../etc/passwd')).toBeNull();
  });
});

describe('idleExitMs', () => {
  it('열린 페이지가 있으면 기다리고, 없어지면 onIdle을 부른다', async () => {
    const onIdle = vi.fn();
    const idle = await app.startServer({ host: '127.0.0.1', port: 0, webDir, idleExitMs: 40, onIdle });
    try {
      const stream = await fetch(`http://127.0.0.1:${idle.port}/api/stream`);
      await new Promise((r) => setTimeout(r, 200));
      expect(onIdle).not.toHaveBeenCalled();
      await stream.body?.cancel();
      await vi.waitFor(() => expect(onIdle).toHaveBeenCalledTimes(1), { timeout: 2000 });
    } finally {
      await idle.close();
    }
  });

  it('idleExitMs가 없으면 부르지 않는다', async () => {
    const onIdle = vi.fn();
    const forever = await app.startServer({ host: '127.0.0.1', port: 0, webDir, onIdle });
    await new Promise((r) => setTimeout(r, 150));
    await forever.close();
    expect(onIdle).not.toHaveBeenCalled();
  });
});
