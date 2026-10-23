"use client";

import { useEffect, useState } from "react";

/** 깨진 인코딩(占쏙옙)과 블록 문자로 손상된 신호를 흉내 낸다. */
const GLYPHS = ["占", "쏙", "옙", "�", "▓", "▒", "█"];

type GlitchTextProps = {
  text: string;
  /** 0~1 손상도. 낮을수록 글자가 덜 깨진다. */
  intensity: number;
  className?: string;
};

/** 시각용 사본이다. 보조기기용 원문은 호출하는 쪽에서 따로 제공한다. */
export default function GlitchText({ text, intensity, className }: GlitchTextProps) {
  const [glitched, setGlitched] = useState<string | null>(null);
  const level = Math.round(Math.min(1, Math.max(0, intensity)) * 10) / 10;

  useEffect(() => {
    if (level === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => {
      if (Math.random() > level * 0.3) {
        setGlitched(null);
        return;
      }
      const chars = Array.from(text);
      for (let count = 1 + Math.floor(Math.random() * 2); count > 0; count -= 1) {
        const index = Math.floor(Math.random() * chars.length);
        if (chars[index].trim()) chars[index] = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      }
      setGlitched(chars.join(""));
    }, 150);
    return () => clearInterval(timer);
  }, [text, level]);

  const output = level > 0 && glitched ? glitched : text;
  return <span className={className} data-text={output} aria-hidden="true">{output}</span>;
}
