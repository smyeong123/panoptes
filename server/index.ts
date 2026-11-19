// 빌드된 dist를 서빙하는 단독 실행 서버: npm run build && npm start
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './app.ts';
import { PROJECTS_DIR } from './watcher.ts';

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 4317);

await startServer({ host: HOST, port: PORT, webDir: DIST });
console.log(`👁️ Panoptes → http://${HOST}:${PORT}  (watching ${PROJECTS_DIR})`);
