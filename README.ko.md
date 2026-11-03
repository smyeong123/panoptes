<div align="center">

<img src="public/favicon.svg" width="120" height="120" alt="Panoptes 아이콘">

# Panoptes

Claude Code 세션을 따라 움직이는 아이소메트릭 사무실

[English](README.md) · **한국어**

</div>

<img src="docs/images/demo-agents.gif" alt="Claude가 일을 나눠 서브에이전트 셋에게 전화하고, 엘리베이터로 온 서브에이전트들이 자료실과 서버실에서 일한 뒤 보고하고 퇴근하는 모습">

Panoptes는 AI 코딩 에이전트가 지금 무엇을 하는지 보여 줍니다. Claude Code와 Codex CLI가 내 컴퓨터에 남기는 세션 기록을 읽고, 작은 아이소메트릭 사무실의 캐릭터를 그대로 움직입니다.

- **일마다 방이 따로 있습니다.** 파일 읽기는 자료실, 수정은 개발실, 셸 명령은 서버실, 웹 검색은 정보검색실에서 합니다.
- **서브에이전트는 엘리베이터로 출근합니다.** Claude 옆에서 일하고, 보고한 뒤 퇴근합니다. Claude가 실행한 Codex도 서브에이전트로 나타납니다.
- **프로젝트마다 층이 하나씩 있습니다.** 층마다 git 브랜치와 상태가 보이고, 세션마다 매장이 하나씩 있습니다.
- **같은 파일 경고.** 두 세션이 같은 파일을 동시에 고치면 알려 줍니다.
- **라이트·다크 테마**와 한국어·영어 화면을 지원합니다.

| 생각하는 중 | 명령이 실패함 |
|:---:|:---:|
| <img src="docs/images/state-thinking.jpg" width="400" alt="구름 말풍선을 띄우고 생각하는 Claude"> | <img src="docs/images/state-error.jpg" width="400" alt="서버실에서 빨간 오류 말풍선을 띄운 Claude"> |
| **나에게 질문함** | **두 세션이 같은 파일을 고침** |
| <img src="docs/images/state-asking.jpg" width="400" alt="내 자리에 와서 결제 수단을 묻는 Claude"> | <img src="docs/images/state-collision.jpg" width="400" alt="빨갛게 깜빡이는 개발실 화면 위의 충돌 경고"> |

## 시작하기

```bash
npm install
npm run dev                  # http://127.0.0.1:5173
# 또는
npm run build && npm start   # http://127.0.0.1:4317
```

Panoptes는 내 컴퓨터 안에서만 돕니다. 127.0.0.1에만 열리고, 흔한 비밀값은 화면에 보내기 전에 가립니다. 자세한 내용은 [SECURITY.md](SECURITY.md)(영문)를 보세요.

## 더 보기

- [문서](docs/README.md) (영문): 기능, 설정, 구조, 개발
- [기여 안내](CONTRIBUTING.md) (영문)
- [보안 정책](SECURITY.md) (영문)
- 라이선스: [MIT](LICENSE)
