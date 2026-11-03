<div align="center">

<img src="public/favicon.svg" width="120" height="120" alt="Panoptes 아이콘">

# Panoptes

Claude Code 세션을 따라 움직이는 아이소메트릭 사무실

[English](README.md) · **한국어**

</div>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/screenshot-dark.png">
  <img src="docs/images/screenshot-light.png" alt="Panoptes 화면: 개발실에서 코드를 고치는 Claude, 자료실에서 읽는 Explore 서브에이전트, 화이트보드의 할 일 목록, git 브랜치 상태가 보이는 층별 안내판">
</picture>

Panoptes는 AI 코딩 에이전트가 지금 무엇을 하는지 보여 줍니다. Claude Code와 Codex CLI가 내 컴퓨터에 남기는 세션 기록을 읽고, 작은 아이소메트릭 사무실의 캐릭터를 그대로 움직입니다.

- **일마다 방이 따로 있습니다.** 파일 읽기는 자료실, 수정은 개발실, 셸 명령은 서버실, 웹 검색은 정보검색실에서 합니다.
- **서브에이전트는 엘리베이터로 출근합니다.** Claude 옆에서 일하고, 보고한 뒤 퇴근합니다. Claude가 실행한 Codex도 서브에이전트로 나타납니다.
- **프로젝트마다 층이 하나씩 있습니다.** 층마다 git 브랜치와 상태가 보이고, 세션마다 매장이 하나씩 있습니다.
- **같은 파일 경고.** 두 세션이 같은 파일을 동시에 고치면 알려 줍니다.
- **라이트·다크 테마**와 한국어·영어 화면을 지원합니다.

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
