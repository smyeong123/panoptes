# Development

Setup and the PR checklist are in [CONTRIBUTING.md](../CONTRIBUTING.md). This page covers the tests and common recipes.

## Tests

The tests use [Vitest](https://vitest.dev/) and run in Node with no browser. Run them with `npm test`.

| File | Covers |
|---|---|
| `test/parse.test.ts` | Claude Code log lines → events (tools, thinking, subagents, teammates) |
| `test/parseCodex.test.ts` | Codex rollout lines → events |
| `test/codexLink.test.ts` | Matching Codex rollouts to Claude hand-offs |
| `test/office.test.ts` | The agent state machine in `src/state/office.ts` |
| `test/collisions.test.ts` | Edit extraction and same-file collision detection |
| `test/redact.test.ts` | Secret masking |
| `test/git.test.ts` | `gitSnapshot` on a temporary repo (branch, uncommitted, ahead/behind) |
| `test/figure.test.ts` | Character figure geometry |

Build log lines inline in the test from synthetic data. Never paste real session logs. They contain code, paths, prompts and sometimes secrets.

`src/i18n.ts` doesn't touch `window` on import, so the state machine tests can run in Node. Keep it that way.

## Screenshots

The README media lives in `docs/images/`:

- `demo-agents.gif`: about 27 s, 960 px wide, 12 fps, played at 1.5× speed. Claude spawns three subagents that work, report back and leave.
- `state-*.jpg`: 640×400 crops of four states (thinking, a failed command, asking you, a same-file warning).

All of it was recorded against **synthetic demo logs** with fake projects (`acme-web`, `acme-api`, `acme-docs`), by pointing `CLAUDE_PROJECTS_DIR` and `CODEX_HOME` at a throwaway folder. A script appended timed log lines while headless Chrome recorded the page through the DevTools screencast, and ffmpeg encoded the GIF. When you retake them, never capture your real sessions: the floor names, branches, session titles and file names would all end up in the public repo.

## Recipes

### Send a new tool to a room

Add the tool name to `ROOM_BY_TOOL` in `shared/rooms.ts`. Unknown tools go to Claude's desk, and any `mcp__*` tool goes to Research. Update the rooms table in [features.md](features.md).

### Add or change UI text

Add the key to **both** the `ko` and `en` objects in `src/i18n.ts`. Never hard-code user-visible strings in render code.

### Add a redaction pattern

1. Add a `[name, RegExp]` entry to `PATTERNS` in `server/redact.ts`. Use the `g` flag, and anchor the pattern on a distinctive prefix so it doesn't mask normal text.
2. Add a case to `test/redact.test.ts` with an obviously fake value.
3. Update the list in [SECURITY.md](../SECURITY.md#what-panoptes-touches).

### Support a new log shape

Parsing of Claude lines lives in `server/parse.ts`, and parsing of Codex lines in `server/parseCodex.ts`. Add a test with a minimal synthetic line in the matching test file first, then extend the parser.
