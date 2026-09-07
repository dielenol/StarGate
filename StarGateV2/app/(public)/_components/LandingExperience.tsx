"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./LandingExperience.module.css";

const CHAPTERS = [
  { id: "archive", label: "기록 탐색" },
  { id: "convention", label: "기구 소개" },
  { id: "leadership", label: "사무총장" },
  { id: "operations", label: "업무 공간" },
];

/** Content stays visible without JavaScript; motion enhances its first appearance. */
export default function LandingExperience({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
}) {
  const rootRef = useRef<HTMLElement>(null);
  const [chapter, setChapter] = useState("archive");
  const [navigationVisible, setNavigationVisible] = useState(false);

  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    const root = element;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const animations = new Set<Animation>();
    const sections = CHAPTERS.map(({ id }) =>
      root.querySelector<HTMLElement>(`#${id}`),
    );
    const hero = root.querySelector<HTMLElement>("#overview");
    let frame = 0;
    let previousChapter = "archive";
    let previousVisible = false;

    function updatePosition() {
      frame = 0;
      const range = Math.max(
        1,
        document.documentElement.scrollHeight - window.innerHeight,
      );
      const progress = Math.max(0, Math.min(1, window.scrollY / range));
      const heroProgress = Math.max(
        0,
        Math.min(1, window.scrollY / (hero?.offsetHeight || 1)),
      );
      let current = "archive";
      for (const section of sections) {
        if (
          section &&
          section.getBoundingClientRect().top <= window.innerHeight * 0.45
        )
          current = section.id;
      }
      // A short last section can never reach the activation line before the page ends.
      if (progress >= 0.99) current = "operations";
      const visible =
        window.scrollY > Math.min((hero?.offsetHeight || 800) * 0.5, 420);
      // Finish layout reads before applying the compositor-only progress and offset.
      root.style.setProperty("--reading-progress", String(progress));
      root.style.setProperty(
        "--hero-travel",
        motion.matches ? "0px" : `${heroProgress * 32}px`,
      );
      if (current !== previousChapter) {
        previousChapter = current;
        setChapter(current);
      }
      if (visible !== previousVisible) {
        previousVisible = visible;
        setNavigationVisible(visible);
      }
    }

    function schedulePosition() {
      if (!frame) frame = window.requestAnimationFrame(updatePosition);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.unobserve(entry.target);
          if (motion.matches) continue;
          const animation = entry.target.animate(
            [
              { opacity: 0.45, transform: "translateY(22px)" },
              { opacity: 1, transform: "translateY(0)" },
            ],
            { duration: 650, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
          );
          animations.add(animation);
          animation.onfinish = () => animations.delete(animation);
          animation.oncancel = () => animations.delete(animation);
        }
      },
      { threshold: 0.12 },
    );
    root
      .querySelectorAll("[data-reveal]")
      .forEach((element) => observer.observe(element));
    const cancelMotion = () => {
      if (motion.matches) animations.forEach((animation) => animation.cancel());
      schedulePosition();
    };
    const resize = new ResizeObserver(schedulePosition);
    resize.observe(root);
    window.addEventListener("scroll", schedulePosition, { passive: true });
    window.addEventListener("resize", schedulePosition);
    window.addEventListener("pageshow", schedulePosition);
    motion.addEventListener("change", cancelMotion);
    schedulePosition();
    return () => {
      window.cancelAnimationFrame(frame);
      resize.disconnect();
      window.removeEventListener("scroll", schedulePosition);
      window.removeEventListener("resize", schedulePosition);
      window.removeEventListener("pageshow", schedulePosition);
      observer.disconnect();
      animations.forEach((animation) => animation.cancel());
      motion.removeEventListener("change", cancelMotion);
    };
  }, []);

  return (
    <main ref={rootRef} className={className}>
      <div className={styles.progress} aria-hidden="true" />
      {children}
      <nav
        className={styles.chapters}
        aria-label="메인 페이지 목차"
        data-visible={navigationVisible}
        inert={!navigationVisible}
      >
        {CHAPTERS.map((item, index) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            aria-current={chapter === item.id ? "location" : undefined}
          >
            <span aria-hidden="true">0{index + 1}</span>
            {item.label}
          </a>
        ))}
      </nav>
    </main>
  );
}
