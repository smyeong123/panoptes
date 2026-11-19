# Configuration

Panoptes is configured with environment variables. All of them are optional.

| Variable | Default | What it does |
|---|---|---|
| `CLAUDE_PROJECTS_DIR` | `~/.claude/projects` | Folder of Claude Code session logs to read |
| `CODEX_HOME` | `~/.codex` | Codex CLI home. Rollouts are read from `$CODEX_HOME/sessions` |
| `HOST` | `127.0.0.1` | Address the standalone server binds to |
| `PORT` | `4317` | Port of the standalone server |

`HOST` and `PORT` apply only to the standalone server. The dev server is fixed to `127.0.0.1:5173` in `vite.config.ts`. The plugin ignores both and reads `PANOPTES_HOST`, `PANOPTES_PORT` and `PANOPTES_IDLE_MINUTES` instead. See [plugin.md](plugin.md#configuration).

> **Warning:** binding to anything other than `127.0.0.1` lets anyone who can reach that address watch your session activity. See [SECURITY.md](../SECURITY.md).

Open the page by IP address, as `localhost`, or by the exact `HOST` value. Any other hostname gets a 403, so if you bind to `0.0.0.0` and visit `http://mybox.local:4317`, use the machine's IP address instead or set `HOST=mybox.local`.

## Three ways to run

| | Dev server | Standalone server | Plugin |
|---|---|---|---|
| Command | `npm run dev` | `npm run build && npm start` | `/panoptes:open` in Claude Code |
| Address | http://127.0.0.1:5173 | http://127.0.0.1:4317 | http://127.0.0.1:4317 |
| Serves | Vite with hot reload | the built `dist/` (`server/index.ts`) | the committed `plugin/dist/` (`server/cli.ts`) |
| Runs | in your terminal | in your terminal | in the background, until idle for 30 minutes |
| Use it for | working on Panoptes | running it from a clone | running it without a clone |

All three use the same bridge (`server/bridge.ts`), so the stream they serve is identical. The dev server mounts it as a Vite plugin (`officeBridge()` in `vite.config.ts`). The standalone server and the plugin share one HTTP server (`server/app.ts`).

Examples:

```bash
CLAUDE_PROJECTS_DIR=/path/to/other/projects npm run dev
PORT=8080 npm start
```

## In the browser

- **Theme:** 🖥️ Auto / ☀️ Light / 🌙 Dark at the top of the page. Auto follows the OS setting.
- **Language:** 한국어 / English next to the theme toggle. On first visit it follows the browser language.

Both choices are saved in the browser's `localStorage`.
