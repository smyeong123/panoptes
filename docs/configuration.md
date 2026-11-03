# Configuration

Panoptes is configured with environment variables. All of them are optional.

| Variable | Default | What it does |
|---|---|---|
| `CLAUDE_PROJECTS_DIR` | `~/.claude/projects` | Folder of Claude Code session logs to read |
| `CODEX_HOME` | `~/.codex` | Codex CLI home. Rollouts are read from `$CODEX_HOME/sessions` |
| `HOST` | `127.0.0.1` | Address the standalone server binds to |
| `PORT` | `4317` | Port of the standalone server |

`HOST` and `PORT` apply only to the standalone server. The dev server is fixed to `127.0.0.1:5173` in `vite.config.ts`.

> **Warning:** binding to anything other than `127.0.0.1` lets anyone who can reach that address watch your session activity. See [SECURITY.md](../SECURITY.md).

## Two ways to run

| | Dev server | Standalone server |
|---|---|---|
| Command | `npm run dev` | `npm run build && npm start` |
| Address | http://127.0.0.1:5173 | http://127.0.0.1:4317 |
| Serves | Vite with hot reload | the built `dist/` (`server/index.ts`) |
| Use it for | working on Panoptes | just running it |

Both use the same bridge (`server/bridge.ts`), so the stream they serve is identical. The dev server mounts it as a Vite plugin (`officeBridge()` in `vite.config.ts`).

Examples:

```bash
CLAUDE_PROJECTS_DIR=/path/to/other/projects npm run dev
PORT=8080 npm start
```

## In the browser

- **Theme:** 🖥️ Auto / ☀️ Light / 🌙 Dark at the top of the page. Auto follows the OS setting.
- **Language:** 한국어 / English next to the theme toggle. On first visit it follows the browser language.

Both choices are saved in the browser's `localStorage`.
