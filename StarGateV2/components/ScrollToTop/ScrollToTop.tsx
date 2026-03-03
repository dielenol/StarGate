"use client";

import { useEffect, useState } from "react";
import styles from "./ScrollToTop.module.css";

const SCROLL_THRESHOLD = 300;

export default function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > SCROLL_THRESHOLD);
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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
      ▲
    </button>
  );
}
