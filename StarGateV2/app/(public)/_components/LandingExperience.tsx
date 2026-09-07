"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Content stays visible without JavaScript; motion enhances its first appearance. */
export default function LandingExperience({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
}) {
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const animations = new Set<Animation>();
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
    rootRef.current
      ?.querySelectorAll("[data-reveal]")
      .forEach((element) => observer.observe(element));
    const cancelMotion = () => {
      if (motion.matches) animations.forEach((animation) => animation.cancel());
    };
    motion.addEventListener("change", cancelMotion);
    return () => {
      observer.disconnect();
      animations.forEach((animation) => animation.cancel());
      motion.removeEventListener("change", cancelMotion);
    };
  }, []);

  return (
    <main ref={rootRef} className={className}>
      {children}
    </main>
  );
}
