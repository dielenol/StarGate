import { parseThemePreference, type ThemePreference } from "./preference";

export const SYSTEM_THEME_QUERY = "(prefers-color-scheme: dark)";

/** 화면에 실제로 적용된 테마. 명시 설정(data-theme)이 없으면 시스템 설정을 따른다. */
export function getRenderedTheme(): ThemePreference {
  const explicit = parseThemePreference(
    document.documentElement.dataset.theme,
  );
  if (explicit) return explicit;
  return window.matchMedia(SYSTEM_THEME_QUERY).matches ? "dark" : "light";
}

/** 테마 토글과 시스템 설정 변경을 모두 구독한다. 반환값은 구독 해제 함수. */
export function subscribeRenderedTheme(
  listener: (theme: ThemePreference) => void,
): () => void {
  const media = window.matchMedia(SYSTEM_THEME_QUERY);
  const notify = () => listener(getRenderedTheme());

  media.addEventListener("change", notify);
  const observer = new MutationObserver(notify);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  return () => {
    media.removeEventListener("change", notify);
    observer.disconnect();
  };
}
