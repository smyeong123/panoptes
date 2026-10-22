// 테마: 'auto'(시스템 따라감) | 'light' | 'dark'.
// 실제로 칠하는 값은 html[data-theme]의 light/dark 둘 중 하나다. 첫 화면 깜빡임은 index.html의 인라인 스크립트가 막는다.
export type ThemePref = 'auto' | 'light' | 'dark';

const KEY = 'rto.theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');

function loadPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

let pref = loadPref();

function apply() {
  const dark = pref === 'dark' || (pref === 'auto' && media.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  for (const b of document.querySelectorAll<HTMLButtonElement>('.theme-toggle button')) {
    b.setAttribute('aria-pressed', String(b.dataset.theme === pref));
  }
}

export function initTheme() {
  media.addEventListener('change', apply);
  document.querySelector('.theme-toggle')?.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-theme]');
    if (!b) return;
    pref = b.dataset.theme as ThemePref;
    try {
      localStorage.setItem(KEY, pref);
    } catch {
      // 저장 못 해도 이번 화면에는 적용된다
    }
    apply();
  });
  apply();
}
