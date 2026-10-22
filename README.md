# 👁️ Panoptes

**English** | [한국어](#한국어)

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

---

## 한국어

Claude Code가 남기는 세션 기록(`~/.claude/projects/**/*.jsonl`)을 0.25초마다 따라 읽어서, 아이소메트릭 사무실의 캐릭터를 터미널과 같이 움직이게 합니다.

```bash
npm install
npm run dev        # http://127.0.0.1:5173
# 또는
npm run build && npm start   # http://127.0.0.1:4317
```

`CLAUDE_PROJECTS_DIR`로 읽을 폴더를, `PORT`/`HOST`로 단독 실행 서버 주소를 바꿀 수 있습니다. 서버는 127.0.0.1에만 열리고, 화면에는 파일 이름이나 명령 앞부분 같은 요약만 보냅니다.

상단의 🖥️ 자동 / ☀️ 라이트 / 🌙 다크로 테마를 바꿉니다. 자동은 시스템 설정을 따릅니다. 라이트는 낮의 사무실, 다크는 밤의 사무실(야경, 켜진 화면, 스탠드 불빛)입니다. 색은 모두 `src/styles.css`의 CSS 변수에 모여 있습니다.

테마 옆의 한국어 / English로 언어를 바꿉니다. 고른 언어는 기억하고, 처음에는 브라우저 언어를 따릅니다.

### 방
| 방 | 하는 일 |
|---|---|
| 📚 자료실 | Read, Grep, Glob: 책을 펴고 읽음 |
| 💻 개발실 | Edit, Write: 아이맥 화면에 코드가 흐름 |
| 🗄️ 서버실 | Bash, PowerShell: 도는 동안 랙 불빛이 빨라지고, git이면 git 표시가 뜸 |
| 🌐 정보검색실 | WebSearch, WebFetch, `mcp__*`: 지구본이 돌고 안테나가 신호를 보냄 |
| 🗒️ 회의실 | TodoWrite, TaskCreate, ExitPlanMode 계획: 화이트보드에 적음 |
| 🧑‍💻 내 자리 | AskUserQuestion, ExitPlanMode: 내 책상까지 와서 물어봄 |

- 생각할 땐 턱을 괴고, 생각 요약이 구름 말풍선으로 뜹니다. 요약이 비어 있으면 "…"만 뜹니다.
- 도구가 실패하면 식은땀을 흘리며 빨간 말풍선을 띄웁니다.
- 서브에이전트: Claude가 전화를 걸면 엘리베이터로 출근합니다(Explore는 초록 옷에 모자, Plan은 보라 옷에 안경). 일을 마치면 Claude에게 보고하고 "👋 퇴근합니다!"라고 한 뒤 엘리베이터로 사라집니다. 보고하러 가다가 일을 또 받으면 다시 일하러 돌아갑니다.
- 왼쪽 층별 안내판: 층마다 프로젝트 하나, 매장마다 세션 하나입니다. 지금 움직이는 층엔 초록불이 켜지고, 층을 누르면 엘리베이터를 타고 이동합니다. `/clear`로 같은 층에 새 세션이 생기면 그쪽으로 따라갑니다. 매장을 누르면 그 세션에 고정됩니다.

### 구조
- `server/parse.ts`: jsonl 한 줄을 사무실 이벤트로 바꿉니다
- `server/watcher.ts`: 층·매장을 스캔하고 세션을 tail로 따라 읽습니다(서브에이전트 포함)
- `server/bridge.ts`: SSE `/api/stream`. Vite 플러그인과 단독 서버(`server/index.ts`)가 함께 씁니다
- `src/state/office.ts`: 에이전트 상태 기계(이동, 포즈, 말풍선, 서브에이전트 생명주기)
- `src/render/*`: 아이소메트릭 SVG 건물, 캐릭터, 층별 안내판
- `src/i18n.ts`: 한국어/영어 문구와 언어 전환

`npm test`로 파서와 상태 기계 테스트를 돌립니다.
