import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import type { Collision, OfficeEvent, ServerMessage } from '../shared/events.ts';
import { CollisionTracker } from './collisions.ts';
import { FORBIDDEN_HOST, isLocalHost } from './host.ts';
import { FloorScanner, SessionTail, sessionFile } from './watcher.ts';

interface Client {
  res: ServerResponse;
  session?: string;
}

/** SSE 허브. 층 목록은 모두에게, 세션 이벤트는 그 세션을 보는 클라이언트에게만 보낸다. */
export class OfficeHub {
  private clients = new Set<Client>();
  private tails = new Map<string, SessionTail>();
  private scanner = new FloorScanner((floors) => this.broadcast({ t: 'floors', floors }));
  private tracker = new CollisionTracker(sessionFile);
  private collisions: Collision[] = [];
  private collisionsJson = '[]';
  private timers: NodeJS.Timeout[] = [];

  /** @param allowedHosts IP와 localhost 말고도 받아 줄 Host 이름 (server/host.ts) */
  constructor(private allowedHosts: readonly string[] = []) {}

  start() {
    this.scanner.start();
    this.timers = [
      // 창에서 벗어난 충돌도 사라져야 하므로 파일 변화와 상관없이 매초 다시 계산한다
      setInterval(() => this.checkCollisions(), 1000).unref(),
      // 프록시가 연결을 끊지 않게 주기적으로 주석을 흘린다
      setInterval(() => {
        for (const c of this.clients) c.res.write(': ping\n\n');
      }, 15000).unref(),
    ];
  }

  stop() {
    this.scanner.stop();
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    for (const tail of this.tails.values()) tail.stop();
    this.tails.clear();
  }

  /** 지금 스트림을 열어 둔 페이지 수. 아무도 없으면 서버가 스스로 끝낼 수 있다. */
  get clientCount(): number {
    return this.clients.size;
  }

  private checkCollisions() {
    const list = this.tracker.update(this.scanner.floors);
    const json = JSON.stringify(list);
    if (json === this.collisionsJson) return;
    this.collisionsJson = json;
    this.collisions = list;
    this.broadcast({ t: 'collisions', list });
  }

  private send(c: Client, msg: ServerMessage) {
    c.res.write(`data: ${JSON.stringify(msg)}\n\n`);
  }

  private broadcast(msg: ServerMessage) {
    for (const c of this.clients) this.send(c, msg);
  }

  /** /api/stream?session=<dir>/<id> 처리. 처리했으면 true. */
  handle(req: IncomingMessage, res: ServerResponse): boolean {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== '/api/stream') return false;
    // Vite의 Host 검사는 이 미들웨어보다 뒤에 돌아서 스트림을 막아 주지 않는다. 여기서 직접 본다.
    if (!isLocalHost(req.headers.host, this.allowedHosts)) {
      res.writeHead(403).end(FORBIDDEN_HOST);
      return true;
    }
    const session = url.searchParams.get('session') ?? undefined;
    if (session && !SessionTail.valid(session)) {
      res.writeHead(400).end('bad session');
      return true;
    }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    const client: Client = { res, session };
    this.clients.add(client);
    this.send(client, { t: 'floors', floors: this.scanner.floors });
    this.send(client, { t: 'collisions', list: this.collisions });

    if (session) {
      const live = this.tails.get(session);
      // 이미 따라 읽는 세션이어도 새 클라이언트에겐 처음부터 상태를 재생해 준다
      const tail = live ?? new SessionTail(session, (events) => this.toSession(session, events));
      const events = live ? new SessionTail(session, () => {}).replay() : tail.replay();
      this.send(client, { t: 'replay', session, events, source: tail.source });
      if (!live) {
        this.tails.set(session, tail);
        tail.start();
      }
    }

    req.on('close', () => {
      this.clients.delete(client);
      if (session && ![...this.clients].some((c) => c.session === session)) {
        this.tails.get(session)?.stop();
        this.tails.delete(session);
      }
    });
    return true;
  }

  private toSession(session: string, events: OfficeEvent[]) {
    for (const c of this.clients) if (c.session === session) this.send(c, { t: 'events', session, events });
  }
}

export function officeBridge(): Plugin {
  return {
    name: 'office-bridge',
    apply: 'serve',
    configureServer(server) {
      if (process.env.VITEST) return;
      const hub = new OfficeHub();
      hub.start();
      server.middlewares.use((req, res, next) => {
        if (!hub.handle(req, res)) next();
      });
    },
  };
}

