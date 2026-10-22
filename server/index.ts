// 빌드된 dist를 서빙하는 단독 실행 서버: npm run build && npm start
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OfficeHub } from './bridge.ts';
import { PROJECTS_DIR } from './watcher.ts';

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 4317);

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
};

const hub = new OfficeHub();
hub.start();

http
  .createServer((req, res) => {
    if (hub.handle(req, res)) return;
    const urlPath = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    let file = path.join(DIST, urlPath === '/' ? 'index.html' : urlPath);
    if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(DIST, 'index.html');
    }
    if (!fs.existsSync(file)) {
      res.writeHead(500).end('dist가 없습니다. 먼저 npm run build 를 실행하세요.');
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, HOST, () => {
    console.log(`👁️ Panoptes → http://${HOST}:${PORT}  (watching ${PROJECTS_DIR})`);
  });
