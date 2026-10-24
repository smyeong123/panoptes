<div align="center">

<img src="public/favicon.svg" width="120" height="120" alt="Panoptes 아이콘">

# Panoptes

Claude Code 세션을 따라 움직이는 아이소메트릭 사무실

[English](README.md) · **한국어**

</div>

Claude Code가 남기는 세션 기록(`~/.claude/projects/**/*.jsonl`)을 0.25초마다 따라 읽어서, 아이소메트릭 사무실의 캐릭터를 터미널과 같이 움직이게 합니다.

```bash
npm install
npm run dev        # http://127.0.0.1:5173
# 또는
npm run build && npm start   # http://127.0.0.1:4317
```

`CLAUDE_PROJECTS_DIR`로 읽을 폴더를, `PORT`/`HOST`로 단독 실행 서버 주소를 바꿀 수 있습니다. 서버는 127.0.0.1에만 열리고, 화면에는 파일 이름이나 명령 앞부분 같은 요약만 보냅니다. 흔한 비밀값 모양(API 키, GitHub/Slack 토큰, JWT, `Bearer …`, `PASSWORD=…`)은 화면에 보내기 전에 가립니다.

Codex CLI 세션(`~/.codex/sessions`, 또는 `CODEX_HOME`)도 보입니다. 같은 폴더의 Claude 세션과 같은 층에 Codex 표시를 달고 올라오고, 캐릭터는 헤드셋을 쓴 검은 옷차림입니다.

상단의 🖥️ 자동 / ☀️ 라이트 / 🌙 다크로 테마를 바꿉니다. 자동은 시스템 설정을 따릅니다. 라이트는 낮의 사무실, 다크는 밤의 사무실(야경, 켜진 화면, 스탠드 불빛)입니다. 색은 모두 `src/styles.css`의 CSS 변수에 모여 있습니다.

테마 옆의 한국어 / English로 언어를 바꿉니다. 고른 언어는 기억하고, 처음에는 브라우저 언어를 따릅니다.

## 방
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
- 층 이름 아래에 git 상태가 보입니다: `⎇ 브랜치 · ●미커밋 · ↑ahead ↓behind`. 마우스를 올리면 마지막 커밋이 나옵니다.
- 같은 파일 경고: 10분 안에 두 세션(또는 한 세션의 서브에이전트 둘)이 같은 파일을 고치면 층과 매장에 ⚠가 붙고, 상대가 누구인지 알림이 뜨고, 개발실 화면이 빨갛게 깜빡이고, 해당 캐릭터가 말풍선으로 외칩니다.

## 구조
- `server/parse.ts`: jsonl 한 줄을 사무실 이벤트로 바꿉니다
- `server/watcher.ts`: 층·매장(Claude와 Codex)을 스캔하고, 층마다 git 상태를 읽고, 세션을 tail로 따라 읽습니다(서브에이전트 포함)
- `server/parseCodex.ts`: Codex rollout 줄을 사무실 이벤트로 바꿉니다
- `server/collisions.ts`: 여러 세션·서브에이전트가 고친 파일을 찾습니다
- `server/redact.ts`: 서버 밖으로 나가기 전에 비밀값을 가립니다
- `server/bridge.ts`: SSE `/api/stream`. Vite 플러그인과 단독 서버(`server/index.ts`)가 함께 씁니다
- `src/state/office.ts`: 에이전트 상태 기계(이동, 포즈, 말풍선, 서브에이전트 생명주기)
- `src/render/*`: 아이소메트릭 SVG 건물, 캐릭터, 층별 안내판
- `src/i18n.ts`: 한국어/영어 문구와 언어 전환

`npm test`로 파서와 상태 기계 테스트를 돌립니다.
