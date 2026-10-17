"use client";

import Image from "next/image";
import { useId, useState } from "react";

import styles from "./LoginMotion.module.css";

const SPECTRUM = [
  "#e80303",
  "#f3900e",
  "#e2f844",
  "#66ff2e",
  "#151ce9",
  "#860ff0",
  "#eb00f6",
];

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
          </svg>
        </div>
        <div className={styles.motion__optics}>
          <svg className={styles.motion__beams} viewBox="0 0 360 220" fill="none">
            <defs>
              <linearGradient
                id={`${gradientId}-light`}
                x1="0"
                y1="139.5"
                x2="112"
                y2="108.1"
                gradientUnits="userSpaceOnUse"
              >
                <stop stopColor="#fff" stopOpacity="0" />
                <stop offset="0.6" stopColor="#fff" stopOpacity="0.7" />
                <stop offset="1" stopColor="#fff" />
              </linearGradient>
              {SPECTRUM.map((color, index) => (
                <linearGradient
                  key={color}
                  id={`${gradientId}-${index}`}
                  x1="252"
                  y1="108"
                  x2="360"
                  y2="132"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop stopColor={color} />
                  <stop offset="0.65" stopColor={color} stopOpacity="0.65" />
                  <stop offset="1" stopColor={color} stopOpacity="0" />
                </linearGradient>
              ))}
              <filter id={`${gradientId}-glow`} x="-20%" y="-80%" width="140%" height="260%">
                <feGaussianBlur stdDeviation="2.4" />
              </filter>
            </defs>
            <g filter={`url(#${gradientId}-glow)`} opacity="0.55">
              <path d="M0 139.5 112 108.1" stroke={`url(#${gradientId}-light)`} strokeWidth="5" />
              {SPECTRUM.map((color, index) => (
                <path
                  key={color}
                  d={`M252 ${107.5 + index * 2.35} 360 ${131.8 + index * 2.35}`}
                  stroke={`url(#${gradientId}-${index})`}
                  strokeWidth="4"
                />
              ))}
            </g>
            <path d="M0 139.5 112 108.1" stroke={`url(#${gradientId}-light)`} strokeWidth="2.2" />
            {SPECTRUM.map((color, index) => (
              <path
                key={color}
                d={`M252 ${107.5 + index * 2.35} 360 ${131.8 + index * 2.35}`}
                stroke={`url(#${gradientId}-${index})`}
                strokeWidth="2.4"
              />
            ))}
          </svg>
          <div className={styles.motion__logo}>
            <Image src="/assets/favicon.ico" alt="" width={160} height={160} priority unoptimized />
          </div>
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
