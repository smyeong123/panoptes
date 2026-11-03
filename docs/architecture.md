# Architecture

Panoptes is a small Node server plus a browser app. The server tails local agent logs and turns them into events. The browser plays those events as animation.

## Data flow

```
~/.claude/projects/**/*.jsonl      ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl
            │                                   │
            ▼                                   ▼
   server/watcher.ts  ── FloorScanner (every 1 s): floors, stores, git state
                      ── SessionTail  (every 250 ms): one session + its subagents
                      ── CodexIndex: matches Codex rollouts to Claude hand-offs
            │
            ▼
   server/parse.ts / server/parseCodex.ts   one log line → OfficeEvent[]
            │  (all text passes through server/redact.ts)
            ▼
   server/bridge.ts   OfficeHub: SSE at /api/stream, collision checks every 1 s
            │
            ▼  (Server-Sent Events)
   src/main.ts → src/state/office.ts → src/render/*
```

The event types shared by server and client are defined in `shared/events.ts`.

## Source map

| Path | Role |
|---|---|
| `server/watcher.ts` | Scans floors and stores (Claude and Codex), polls each floor's git state, tails sessions including `subagents/*.jsonl` |
| `server/parse.ts` | Turns one Claude Code jsonl line into office events |
| `server/parseCodex.ts` | The same for Codex rollout lines, including `exec` and `apply_patch` |
| `server/redact.ts` | Masks secrets before text leaves the server |
| `server/collisions.ts` | Finds files edited by more than one session or subagent |
| `server/git.ts` | `git status` / `git log -1` snapshot per project folder |
| `server/bridge.ts` | `OfficeHub` and the SSE endpoint `/api/stream`. Shared by the Vite plugin and the standalone server |
| `server/index.ts` | Standalone server: serves `dist/` and the bridge |
| `shared/events.ts` | Event and message types shared by server and client |
| `shared/rooms.ts` | Tool name → room mapping |
| `src/state/office.ts` | Agent state machine: movement, poses, bubbles, subagent lifecycle |
| `src/layout.ts` | Room and spot positions on the floor |
| `src/render/*` | Isometric SVG building, 3D-ish characters, floor directory, motion |
| `src/i18n.ts`, `src/theme.ts` | Language and theme toggles |

## Floors, stores and sessions

- A **floor** is one project folder, i.e. one directory under `~/.claude/projects`. Codex sessions join the floor whose folder matches their `cwd`.
- A **store** is one session file. Only sessions modified in the last 24 hours are listed.
- A floor or store counts as **live** when it was written to in the last 15 seconds.
- Git state is refreshed every 5 s for live floors and every 60 s for idle ones.

## The stream

`GET /api/stream` opens an SSE stream. The server first sends the floor list and the current collisions.

With `?session=<floor-dir>/<session-id>`, it also replays that session's events so far and then streams new ones. The parameter is validated by `SessionTail.valid` and is rejected if it contains `..`, `\` or `:`.

## Codex hand-off linking

When a Claude session calls Codex (`codex exec …` through Bash, or a `mcp__codex__*` tool), `CodexIndex.link` in `server/watcher.ts` looks for the matching rollout. A rollout is a candidate when it:

- started between 5 s before and 10 min after the call, and before the call returned if it has already returned,
- isn't already linked to another call, and
- isn't an interactive `codex-tui` session the user opened themselves.

Among the candidates, a rollout in the same `cwd` wins, then the earliest start. A linked rollout is tailed as Claude's subagent and hidden from the store list. After a server restart, hand-offs are found again by scanning recent Claude logs.

## Collision detection

`server/collisions.ts` reads the last 256 KB of each recent session, including subagent logs. It collects Claude Edit/Write/MultiEdit/NotebookEdit targets and Codex `apply_patch` files, with relative Codex paths resolved against the session `cwd`.

A file edited by two or more different editors (sessions or subagents) within `COLLISION_WINDOW_MS`, which is 10 minutes, is reported as a collision.
