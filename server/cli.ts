// 플러그인 런처. scripts/build-plugin.mjs가 서버와 함께 plugin/dist/panoptes.mjs 한 파일로 묶는다.
//   open    서버가 없으면 백그라운드로 띄우고 브라우저를 연다 (기본)
//   serve   서버를 이 프로세스에서 돌린다. open이 따로 띄우는 것이 이것이다
//   stop    돌고 있는 서버를 끝낸다
//   status  돌고 있는지 알려 준다
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Health, startServer } from './app.ts';
import { VERSION } from './version.ts';

const SELF = fileURLToPath(import.meta.url);
const WEB_DIR = path.join(path.dirname(SELF), 'web');
// 런처는 아무 프로젝트의 셸에서나 불린다. 거기 흔히 있는 HOST/PORT(개발 서버 포트, 셸이 내보낸 호스트 이름)를
// 따라가면 엉뚱한 포트에 뜨거나 바깥 주소로 열릴 수 있어서 전용 이름만 읽는다.
const HOST = process.env.PANOPTES_HOST || '127.0.0.1';
const PORT = Number(process.env.PANOPTES_PORT || 4317);
// 0.0.0.0 같은 바인드 주소로는 접속할 수 없으니 확인과 안내에는 루프백을 쓴다
const VISIT_HOST = HOST === '0.0.0.0' || HOST === '::' ? '127.0.0.1' : HOST;
const BASE = `http://${VISIT_HOST.includes(':') ? `[${VISIT_HOST}]` : VISIT_HOST}:${PORT}`;
const PROBE_TIMEOUT_MS = 1000;
const START_WAIT_MS = 5000;
const STOP_WAIT_MS = 3000;
const DEFAULT_IDLE_MINUTES = 30;

type Probe = { state: 'free' } | { state: 'other' } | { state: 'panoptes'; health: Health };

function isHealth(value: unknown): value is Health {
  const h = value as Partial<Health> | null;
  return h?.app === 'panoptes' && typeof h.version === 'string' && Number.isInteger(h.pid) && (h.pid as number) > 0;
}

/** 이 주소에 누가 있는지 본다: 아무도 없음 / Panoptes / 다른 프로그램 */
async function probe(): Promise<Probe> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
  } catch (err) {
    // 연결 거부면 빈 포트다. 그 밖(응답 없음 등)은 다른 프로그램이 잡고 있는 것으로 본다
    const code = (err as { cause?: { code?: string } }).cause?.code;
    return code === 'ECONNREFUSED' ? { state: 'free' } : { state: 'other' };
  }
  const body: unknown = await res.json().catch(() => null);
  return isHealth(body) ? { state: 'panoptes', health: body } : { state: 'other' };
}

async function waitUntil(want: Probe['state'], ms: number): Promise<Probe> {
  const until = Date.now() + ms;
  for (;;) {
    const now = await probe();
    if (now.state === want || Date.now() >= until) return now;
    await new Promise((r) => setTimeout(r, 100));
  }
}

async function stopServer(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // 이미 끝난 프로세스면 아래에서 포트가 비었는지만 확인한다
  }
  return (await waitUntil('free', STOP_WAIT_MS)).state === 'free';
}

function openBrowser(url: string) {
  const [cmd, args]: [string, string[]] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '', url]]
        : ['xdg-open', [url]];
  const child = spawn(cmd, args, { stdio: 'ignore', detached: true, windowsHide: true });
  // 화면이 없는 환경(SSH 등)에서는 못 연다. 주소는 출력하므로 넘어간다
  child.on('error', () => {});
  child.unref();
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function open(launchBrowser: boolean) {
  let now = await probe();
  if (now.state === 'panoptes' && now.health.version !== VERSION) {
    // 플러그인을 업데이트하면 예전 서버가 읽던 폴더가 지워질 수 있으니 새 버전으로 바꿔 띄운다
    if (!(await stopServer(now.health.pid))) {
      fail(`Could not stop Panoptes ${now.health.version} at ${BASE} to replace it with ${VERSION}.`);
    }
    now = { state: 'free' };
  }
  if (now.state === 'other') {
    fail(`Something other than Panoptes is answering at ${BASE}. Set PANOPTES_PORT to a free port and try again.`);
  }
  if (now.state === 'free') {
    // execArgv를 넘겨야 번들 전(tsx server/cli.ts)에도 같은 방식으로 뜬다
    const child = spawn(process.execPath, [...process.execArgv, SELF, 'serve'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
    now = await waitUntil('panoptes', START_WAIT_MS);
    if (now.state !== 'panoptes') {
      fail(`Panoptes did not start within ${START_WAIT_MS / 1000} seconds. Run "node ${SELF} serve" to see why.`);
    }
  }
  if (launchBrowser) openBrowser(BASE);
  console.log(`Panoptes is running at ${BASE}`);
}

async function serve() {
  const raw = Number(process.env.PANOPTES_IDLE_MINUTES ?? DEFAULT_IDLE_MINUTES);
  const minutes = Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_IDLE_MINUTES;
  await startServer({
    host: HOST,
    port: PORT,
    webDir: WEB_DIR,
    idleExitMs: minutes > 0 ? minutes * 60_000 : undefined,
  });
  console.log(`👁️ Panoptes ${VERSION} → ${BASE}`);
}

async function stop() {
  const now = await probe();
  if (now.state !== 'panoptes') {
    console.log(`Panoptes is not running at ${BASE}.`);
    return;
  }
  if (!(await stopServer(now.health.pid))) fail(`Panoptes at ${BASE} did not stop.`);
  console.log('Panoptes stopped.');
}

async function status() {
  const now = await probe();
  console.log(
    now.state === 'panoptes'
      ? `Panoptes ${now.health.version} is running at ${BASE}`
      : `Panoptes is not running at ${BASE}.`,
  );
}

const [command = 'open', ...flags] = process.argv.slice(2);
switch (command) {
  case 'open':
    await open(!flags.includes('--no-open'));
    break;
  case 'serve':
    await serve();
    break;
  case 'stop':
    await stop();
    break;
  case 'status':
    await status();
    break;
  default:
    fail('Usage: panoptes.mjs [open [--no-open] | serve | stop | status]');
}
