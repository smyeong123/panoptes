<div align="center">

<img src="public/favicon.svg" width="120" height="120" alt="Panoptes icon">

# Panoptes

An isometric office that moves along with your Claude Code sessions.

**English** · [한국어](README.ko.md)

</div>

Panoptes tails the session logs that Claude Code writes (`~/.claude/projects/**/*.jsonl`) every 0.25 seconds and turns them into an isometric office, where the characters move in step with your terminal.

```bash
npm install
npm run dev        # http://127.0.0.1:5173
# or
npm run build && npm start   # http://127.0.0.1:4317
```

Set `CLAUDE_PROJECTS_DIR` to change which folder is read, and `PORT`/`HOST` to change the address of the standalone server. The server only listens on 127.0.0.1 and sends the page summaries only, such as file names or the start of a command.

Switch the theme with 🖥️ Auto / ☀️ Light / 🌙 Dark at the top. Auto follows your system setting. Light is the office by day; dark is the office at night (city lights, glowing screens, floor lamps). All colors live as CSS variables in `src/styles.css`.

Switch the language with 한국어 / English next to the theme toggle. Your choice is remembered; on first visit it follows the browser language.

## Rooms
| Room | What happens there |
|---|---|
| 📚 Library | Read, Grep, Glob: opens a book and reads |
| 💻 Dev Room | Edit, Write: code scrolls across the iMac screen |
| 🗄️ Server Room | Bash, PowerShell: rack lights blink faster while it runs, and a git badge shows for git commands |
| 🌐 Research | WebSearch, WebFetch, `mcp__*`: the globe spins and the antenna sends signals |
| 🗒️ Meeting Room | TodoWrite, TaskCreate, ExitPlanMode plans: written on the whiteboard |
| 🧑‍💻 Your desk | AskUserQuestion, ExitPlanMode: walks over to your desk to ask |

- While thinking, Claude rests its chin on a hand and the thinking summary shows in a cloud bubble. If the summary is empty, it shows just "…".
- When a tool fails, Claude breaks into a cold sweat and shows a red bubble.
- Subagents: when Claude makes a phone call, a subagent arrives by elevator (Explore wears green with a cap, Plan wears purple with glasses). When done, it reports to Claude, says "👋 Heading home!" and leaves by elevator. If it gets more work on the way to report, it goes back to work.
- Floor directory on the left: one floor per project, one store per session. Floors with activity light up green; click a floor to ride the elevator there. When `/clear` starts a new session on the same floor, the view follows it. Click a store to pin that session.

## Structure
- `server/parse.ts`: turns one jsonl line into office events
- `server/watcher.ts`: scans floors and stores, and tails sessions (including subagents)
- `server/bridge.ts`: SSE `/api/stream`, shared by the Vite plugin and the standalone server (`server/index.ts`)
- `src/state/office.ts`: agent state machine (movement, poses, bubbles, subagent lifecycle)
- `src/render/*`: isometric SVG building, characters, floor directory
- `src/i18n.ts`: Korean/English strings and the language toggle

Run `npm test` for the parser and state machine tests.
