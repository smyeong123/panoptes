// 빌드된 페이지와 브리지를 서빙하는 HTTP 서버.
// npm start(server/index.ts)와 플러그인 런처(server/cli.ts)가 같이 쓴다.
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { OfficeHub } from './bridge.ts';
import { VERSION } from './version.ts';

export interface ServerOptions {
  host: string;
  port: number;
  /** 빌드된 페이지(index.html, assets)가 있는 폴더 */
  webDir: string;
  /** 열어 둔 페이지가 이 시간 동안 하나도 없으면 onIdle을 부른다. 없으면 계속 돈다. */
  idleExitMs?: number;
  /** 기본은 프로세스 종료. 테스트에서 바꿔 끼운다. */
  onIdle?: () => void;
}

/** GET /api/health 응답. 런처가 이 포트의 주인이 Panoptes인지, 어느 버전인지 확인한다. */
export interface Health {
  app: 'panoptes';
  version: string;
  pid: number;
}

export interface RunningServer {
  port: number;
  close(): Promise<void>;
}

const IDLE_CHECK_MS = 30_000;

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
};

/** 요청 경로를 webDir 안의 파일 경로로 바꾼다. 폴더 밖을 가리키면 null. */
export function resolveStatic(webDir: string, urlPath: string): string | null {
  const root = path.resolve(webDir);
  const file = path.join(root, urlPath === '/' ? 'index.html' : urlPath);
  // startsWith(root)만 보면 이름이 같은 글자로 시작하는 옆 폴더(dist-old 등)가 통과한다
  return file === root || file.startsWith(root + path.sep) ? file : null;
}

export function startServer(opts: ServerOptions): Promise<RunningServer> {
  const root = path.resolve(opts.webDir);
  const hub = new OfficeHub();
  hub.start();

  const respond = (req: http.IncomingMessage, res: http.ServerResponse) => {
    if (hub.handle(req, res)) return;
    const { pathname } = new URL(req.url ?? '/', 'http://localhost');
    if (pathname === '/api/health') {
      const health: Health = { app: 'panoptes', version: VERSION, pid: process.pid };
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(health));
      return;
    }
    let file = resolveStatic(root, decodeURIComponent(pathname));
    if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(root, 'index.html');
    }
    if (!fs.existsSync(file)) {
      res.writeHead(500).end('dist가 없습니다. 먼저 npm run build 를 실행하세요.');
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  };

  const server = http.createServer((req, res) => {
    try {
      respond(req, res);
    } catch {
      // 깨진 % 인코딩이나 '//' 같은 주소는 URL 해석에서 예외를 던진다. 요청 하나로 서버가 죽으면 안 된다.
      if (!res.headersSent) res.writeHead(400);
      res.end('bad request');
    }
  });

  let idleTimer: NodeJS.Timeout | undefined;
  if (opts.idleExitMs) {
    const idleMs = opts.idleExitMs;
    const onIdle = opts.onIdle ?? (() => process.exit(0));
    let since = Date.now();
    idleTimer = setInterval(
      () => {
        if (hub.clientCount > 0) since = Date.now();
        else if (Date.now() - since >= idleMs) {
          clearInterval(idleTimer);
          onIdle();
        }
      },
      Math.min(idleMs, IDLE_CHECK_MS),
    );
  }

  const stop = () => {
    clearInterval(idleTimer);
    hub.stop();
  };

  return new Promise((resolve, reject) => {
    const failed = (err: Error) => {
      stop();
      reject(err);
    };
    server.once('error', failed);
    server.listen(opts.port, opts.host, () => {
      server.off('error', failed);
      resolve({
        port: (server.address() as AddressInfo).port,
        close: () =>
          new Promise<void>((done) => {
            stop();
            server.close(() => done());
            server.closeAllConnections();
          }),
      });
    });
  });
}
