import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import type { OfficeEvent, ServerMessage } from '../shared/events.ts';
import { FloorScanner, SessionTail } from './watcher.ts';

interface Client {
  res: ServerResponse;
  session?: string;
}

/** SSE 허브. 층 목록은 모두에게, 세션 이벤트는 그 세션을 보는 클라이언트에게만 보낸다. */
export class OfficeHub {
  private clients = new Set<Client>();
  private tails = new Map<string, SessionTail>();
  private scanner = new FloorScanner((floors) => this.broadcast({ t: 'floors', floors }));

  start() {
    this.scanner.start();
    // 프록시가 연결을 끊지 않게 주기적으로 주석을 흘린다
    setInterval(() => {
      for (const c of this.clients) c.res.write(': ping\n\n');
    }, 15000).unref();
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

    if (session) {
      const live = this.tails.get(session);
      // 이미 따라 읽는 세션이어도 새 클라이언트에겐 처음부터 상태를 재생해 준다
      const tail = live ?? new SessionTail(session, (events) => this.toSession(session, events));
      const events = live ? new SessionTail(session, () => {}).replay() : tail.replay();
      this.send(client, { t: 'replay', session, events });
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

