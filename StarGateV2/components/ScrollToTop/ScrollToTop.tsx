"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { IconChevronUp } from "@/components/icons";

import styles from "./ScrollToTop.module.css";

const SCROLL_THRESHOLD = 300;
const PLAYER_PAGE_THRESHOLD = 120;

export default function ScrollToTop() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const threshold = pathname.startsWith("/world/player")
      ? PLAYER_PAGE_THRESHOLD
      : SCROLL_THRESHOLD;

    function onScroll() {
      setVisible(window.scrollY > threshold);
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [pathname]);

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (!visible) return null;

  return (
    <button
      type="button"
      className={styles.button}
      onClick={scrollToTop}
      aria-label="맨 위로 이동"
    >
      <IconChevronUp aria-hidden />
    </button>
  );
}
