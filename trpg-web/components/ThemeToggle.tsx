"use client";

import { useCallback, useEffect, useState } from "react";

import {
  getNextThemePreference,
  parseThemePreference,
  THEME_COOKIE_MAX_AGE_SECONDS,
  THEME_COOKIE_NAME,
  type ThemePreference,
} from "@/lib/theme/preference";

import styles from "./ThemeToggle.module.css";

const SYSTEM_THEME_QUERY = "(prefers-color-scheme: dark)";

function getRenderedTheme(): ThemePreference {
  const explicit = parseThemePreference(
    document.documentElement.dataset.theme,
  );
  if (explicit) return explicit;
  return window.matchMedia(SYSTEM_THEME_QUERY).matches ? "dark" : "light";
}

export function ThemeToggle() {
  const [renderedTheme, setRenderedTheme] = useState<ThemePreference | null>(
    null,
  );

  useEffect(() => {
    const media = window.matchMedia(SYSTEM_THEME_QUERY);
    const syncTheme = () => setRenderedTheme(getRenderedTheme());
    syncTheme();

    if (parseThemePreference(document.documentElement.dataset.theme)) {
      return;
    }

    media.addEventListener("change", syncTheme);
    return () => media.removeEventListener("change", syncTheme);
  }, []);

  const handleToggle = useCallback(() => {
    const current = getRenderedTheme();
    const next = getNextThemePreference(current);
    document.documentElement.dataset.theme = next;
    document.cookie = `${THEME_COOKIE_NAME}=${next}; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
    setRenderedTheme(next);
  }, []);

  const nextTheme = renderedTheme
    ? getNextThemePreference(renderedTheme)
    : "light";
  const label = renderedTheme
    ? `${renderedTheme === "light" ? "라이트" : "다크"} 테마 사용 중. ${nextTheme === "light" ? "라이트" : "다크"} 테마로 전환`
    : "테마 전환";

  return (
    <button
      className={styles.themeToggle}
      type="button"
      aria-label={label}
      title={label}
      onClick={handleToggle}
    >
      <span className={styles.themeToggle__icon} aria-hidden="true">
        {renderedTheme === "dark" ? "☀" : "☾"}
      </span>
      <span className={styles.themeToggle__label}>
        {renderedTheme === "dark" ? "라이트" : "다크"}
      </span>
    </button>
  );
}
