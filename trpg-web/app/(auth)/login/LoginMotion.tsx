"use client";

import Image from "next/image";
import { useId, useState } from "react";

import styles from "./LoginMotion.module.css";

const SPECTRUM = ["#ff647f", "#ffab66", "#eddb70", "#74dba0", "#6ab6ff", "#bc8bfa"];

export function LoginMotion() {
  const [paused, setPaused] = useState(false);
  const gradientId = useId();

  return (
    <div className={styles.motion} data-paused={paused}>
      <div className={styles.motion__scene} aria-hidden="true">
        <div className={styles.motion__halo} />
        <div className={styles.motion__orbit}>
          <svg viewBox="0 0 360 220" fill="none">
            <path d="m180 8 120 65v74l-120 65-120-65V73Z" />
            <path d="m60 73 240 74M60 147 300 73M180 8v204" />
            <path d="m180 8 56 102-56 102-56-102Z" />
          </svg>
        </div>
        <div className={styles.motion__optics}>
          <svg className={styles.motion__beams} viewBox="0 0 360 220" fill="none">
            <defs>
              <linearGradient id={`${gradientId}-light`} x1="0" y1="116" x2="112" y2="110" gradientUnits="userSpaceOnUse">
                <stop stopColor="currentColor" stopOpacity="0" />
                <stop offset="1" stopColor="currentColor" stopOpacity="0.9" />
              </linearGradient>
              {SPECTRUM.map((color, index) => (
                <linearGradient key={color} id={`${gradientId}-${index}`} x1="250" y1="110" x2="360" y2="145" gradientUnits="userSpaceOnUse">
                  <stop stopColor={color} stopOpacity="0.85" />
                  <stop offset="1" stopColor={color} stopOpacity="0" />
                </linearGradient>
              ))}
            </defs>
            <path d="M0 116 112 110" stroke={`url(#${gradientId}-light)`} strokeWidth="2" />
            {SPECTRUM.map((color, index) => (
              <path key={color} d={`M250 ${109 + index * 2} 360 ${126 + index * 10}`} stroke={`url(#${gradientId}-${index})`} strokeWidth="2" />
            ))}
          </svg>
          <span className={styles.motion__lightPulse} />
          <div className={styles.motion__logo}>
            <Image src="/assets/favicon.ico" alt="" width={160} height={160} priority unoptimized />
          </div>
          <span className={`${styles.motion__spark} ${styles.motion__spark_one}`} />
          <span className={`${styles.motion__spark} ${styles.motion__spark_two}`} />
          <span className={`${styles.motion__spark} ${styles.motion__spark_three}`} />
        </div>
        <span className={styles.motion__ground} />
      </div>
      <button
        className={styles.motion__toggle}
        type="button"
        aria-pressed={paused}
        aria-label={paused ? "모션 그래픽 일시정지됨 · 재생" : "모션 그래픽 재생 중 · 일시정지"}
        title={paused ? "모션 그래픽 재생" : "모션 그래픽 일시정지"}
        onClick={() => setPaused((current) => !current)}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          {paused ? <path d="m7 4 9 6-9 6Z" /> : <path d="M6 4h3v12H6zm5 0h3v12h-3z" />}
        </svg>
      </button>
    </div>
  );
}
