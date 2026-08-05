export const THEME_COOKIE_NAME = "trpg-theme";
export const THEME_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export type ThemePreference = "light" | "dark";

export function parseThemePreference(
  value: string | null | undefined,
): ThemePreference | null {
  return value === "light" || value === "dark" ? value : null;
}

export function getNextThemePreference(
  current: ThemePreference,
): ThemePreference {
  return current === "light" ? "dark" : "light";
}
