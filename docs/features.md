# Features

What you see in the office, and which log activity drives it.

## Rooms

Each tool call sends the character to a room. The mapping lives in `shared/rooms.ts` (`roomForTool`).

| Room | Tools | What happens there |
|---|---|---|
| 📚 Library | Read, Grep, Glob, LS, NotebookRead | Opens a book and reads |
| 💻 Dev Room | Edit, Write, MultiEdit, NotebookEdit | Code scrolls across the iMac screen |
| 🗄️ Server Room | Bash, PowerShell, BashOutput, Monitor, worktree tools… | Rack lights blink faster while a command runs; git commands get a git badge |
| 🌐 Research | WebSearch, WebFetch, ToolSearch, MCP resource tools, any `mcp__*` | The globe spins and the antenna sends signals |
| 🗒️ Meeting Room | TodoWrite, Task* tools, EnterPlanMode, Skill | Plans are written on the whiteboard |
| 🧑‍💻 Your desk | AskUserQuestion, ExitPlanMode | Walks over to your desk to ask |
| Claude's desk | Agent, Task, SendMessage, and any unknown tool | Works at its own desk |

## Poses and bubbles

- **Thinking:** Claude rests its chin on a hand, and the thinking summary shows in a cloud bubble. An empty summary shows just "…".
- **Tool failure:** Claude breaks into a cold sweat and shows a red bubble.

## Subagents

- When Claude starts a subagent, it makes a phone call and the subagent arrives by elevator.
- Each subagent type has its own look. Explore wears green with a cap, Plan wears purple with glasses, and other types get a color hashed from their name.
- When it's done, the subagent reports to Claude, says "👋 Heading home!" and leaves by elevator. If it gets more work on the way to report, it goes back to work.
- Agent-team teammates follow the same lifecycle.

## Codex CLI

- Codex sessions land on the same floor as the Claude sessions for that folder, marked with a Codex chip. Their character wears black with a headset.
- When Claude hands work to Codex (`codex exec "…"` via Bash, or a `mcp__codex__*` tool), the Codex run appears as Claude's subagent instead of a separate store. It reports back when the command returns. [architecture.md](architecture.md#codex-hand-off-linking) explains how the run is matched.

## Floor directory

- The panel on the left has one floor per project folder and one store per session.
- Floors with recent activity light up green. Click a floor to ride the elevator there.
- When `/clear` starts a new session on the same floor, the view follows it. Click a store to pin that session instead.
- Each floor shows its git state under the name: `⎇ branch · ●uncommitted · ↑ahead ↓behind`. Hover it to see the last commit subject.

## Same-file warning

When two sessions, or two subagents of one session, edit the same file within 10 minutes:

- the floor and the stores get a ⚠,
- a toast names the other side,
- the Dev Room screens flash red, and
- the characters involved shout about it in a bubble.

Both Claude edits (Edit/Write/MultiEdit/NotebookEdit) and Codex `apply_patch` count.

## Theme and language

- Light mode is the office by day. Dark mode is the office at night, with city lights, glowing screens and floor lamps. All colors are CSS variables in `src/styles.css`.
- UI text is available in Korean and English (`src/i18n.ts`).
