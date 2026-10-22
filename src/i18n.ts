// 언어: 'ko' | 'en'. 저장된 값이 없으면 브라우저 언어를 따른다.
// import만 해서는 window를 건드리지 않는다(상태 기계 테스트가 node에서 돈다). 브라우저에서는 initLang()이 정한다.
export type Lang = 'ko' | 'en';

const ko = {
  'hud.searching': '사무실을 찾는 중…',
  'hud.pinned': '📌 이 세션 고정',
  'hud.follow': '🔁 새 세션 따라가기',
  'hud.conn': '세션 기록 연결 상태',
  'hud.followToast': '🚪 새 세션이 열려서 따라갑니다',
  'theme.group': '테마',
  'theme.auto': '🖥️ 자동',
  'theme.autoTitle': '시스템 설정 따라가기',
  'theme.light': '☀️ 라이트',
  'theme.lightTitle': '라이트 모드',
  'theme.dark': '🌙 다크',
  'theme.darkTitle': '다크 모드',
  'lang.group': '언어',
  'dir.subtitle': '층별 안내',
  'ago.now': '방금',
  'ago.min': '{n}분 전',
  'ago.hour': '{n}시간 전',
  'ago.day': '{n}일 전',
  'room.library': '📚 자료실',
  'room.dev': '💻 개발실',
  'room.server': '🗄️ 서버실',
  'room.search': '🌐 정보검색실',
  'room.meeting': '🗒️ 회의실',
  'room.office': '🧑‍💻 오픈 오피스',
  'plate.user': '내 자리',
  'bubble.oneMore': '앗, 하나 더요!',
  'bubble.failed': '앗, 실패…',
  'bubble.call': '📞 {type}님, {desc}',
  'bubble.callDefault': '부탁해요',
  'bubble.report': '📋 다 했어요, 보고드립니다!',
  'bubble.bye': '👋 퇴근합니다!',
  'ask.question': '질문이 있어요',
  'ask.plan': '계획 검토 부탁드려요',
};

type Key = keyof typeof ko;

const en: Record<Key, string> = {
  'hud.searching': 'Looking for the office…',
  'hud.pinned': '📌 Pinned to this session',
  'hud.follow': '🔁 Follow new sessions',
  'hud.conn': 'Session log connection',
  'hud.followToast': '🚪 A new session opened, following it',
  'theme.group': 'Theme',
  'theme.auto': '🖥️ Auto',
  'theme.autoTitle': 'Follow system setting',
  'theme.light': '☀️ Light',
  'theme.lightTitle': 'Light mode',
  'theme.dark': '🌙 Dark',
  'theme.darkTitle': 'Dark mode',
  'lang.group': 'Language',
  'dir.subtitle': 'Directory',
  'ago.now': 'just now',
  'ago.min': '{n}m ago',
  'ago.hour': '{n}h ago',
  'ago.day': '{n}d ago',
  'room.library': '📚 Library',
  'room.dev': '💻 Dev Room',
  'room.server': '🗄️ Server Room',
  'room.search': '🌐 Research',
  'room.meeting': '🗒️ Meeting Room',
  'room.office': '🧑‍💻 Open Office',
  'plate.user': 'You',
  'bubble.oneMore': 'Oh, one more!',
  'bubble.failed': 'Oops, failed…',
  'bubble.call': '📞 {type}, {desc}',
  'bubble.callDefault': 'need your help',
  'bubble.report': '📋 All done, reporting in!',
  'bubble.bye': '👋 Heading home!',
  'ask.question': 'I have a question',
  'ask.plan': 'Please review the plan',
};

const DICT: Record<Lang, Record<Key, string>> = { ko, en };
const KEY = 'rto.lang';

let lang: Lang = 'ko';

export function t(key: Key, vars?: Record<string, string | number>): string {
  const s = DICT[lang][key];
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}

function loadLang(): Lang {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'ko' || v === 'en') return v;
  } catch {
    // 못 읽으면 브라우저 언어로
  }
  return navigator.language.toLowerCase().startsWith('ko') ? 'ko' : 'en';
}

/** data-i18n(본문), data-i18n-title, data-i18n-aria가 붙은 정적 요소를 채운다 */
function apply() {
  document.documentElement.lang = lang;
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) el.textContent = t(el.dataset.i18n as Key);
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle as Key);
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria as Key));
  for (const b of document.querySelectorAll<HTMLButtonElement>('.lang-toggle button')) {
    b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
  }
}

export function initLang(onChange: () => void) {
  lang = loadLang();
  document.querySelector('.lang-toggle')?.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-lang]');
    if (!b || b.dataset.lang === lang) return;
    lang = b.dataset.lang as Lang;
    try {
      localStorage.setItem(KEY, lang);
    } catch {
      // 저장 못 해도 이번 화면에는 적용된다
    }
    apply();
    onChange();
  });
  apply();
}
