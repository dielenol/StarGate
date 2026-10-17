"use client";

import Image from "next/image";
import { useState } from "react";
import { resolvePublicAssetPath } from "@/lib/asset-path";
import styles from "./BrandMotion.module.css";

/** The official emblem stays still; its orbital frame carries the motion. */
export default function BrandMotion({
  variant = "hero",
  className = "",
}: {
  variant?: "hero" | "login";
  className?: string;
}) {
  const [paused, setPaused] = useState(false);

  return (
    <div
      className={`${styles.brand} ${className}`}
      data-variant={variant}
      data-paused={paused}
    >
      <div className={styles.brand__visual} aria-hidden="true">
        <div className={styles.brand__halo} />
        <div className={styles.brand__grid} />
        <div className={styles.brand__geometry}>
          <svg viewBox="0 0 600 600" fill="none">
            <path d="M300 72 498 414H102Z M300 528 102 186H498Z" />
            <circle cx="300" cy="300" r="204" />
            <path d="M300 18v38m0 488v38M18 300h38m488 0h38" />
          </svg>
        </div>
        <div className={styles.brand__orbit}>
          <svg viewBox="0 0 600 600" fill="none">
            <circle cx="300" cy="300" r="272" />
            <circle cx="300" cy="300" r="260" strokeDasharray="1 13" />
            <path d="M300 28a272 272 0 0 1 235.56 136" />
            <circle cx="535.56" cy="164" r="4" />
          </svg>
        </div>
        <div className={styles["brand__orbit--inner"]}>
          <svg viewBox="0 0 600 600" fill="none">
            <circle cx="300" cy="300" r="231" strokeDasharray="120 70 20 85" />
            <circle cx="300" cy="69" r="3" />
          </svg>
        </div>
        <div className={styles.brand__emblem}>
          <Image
            src={resolvePublicAssetPath("/assets/StarGate_logo.webp")}
            alt=""
            width={839}
            height={697}
            sizes={variant === "login" ? "(max-width: 760px) 120px, 260px" : "(max-width: 700px) 55vw, 340px"}
            priority
          />
          <span>NOVUS ORDO</span>
          <small>CONVENTION · MCMXLV</small>
        </div>
        <span className={`${styles.brand__coordinate} ${styles["brand__coordinate--top"]}`}>N / 001</span>
        <span className={`${styles.brand__coordinate} ${styles["brand__coordinate--left"]}`}>19</span>
        <span className={`${styles.brand__coordinate} ${styles["brand__coordinate--right"]}`}>45</span>
      </div>
      <div className={styles.brand__controls}>
        <span className={styles.brand__caption}>질서를 수호하는 이름</span>
        <button
          className={styles.brand__toggle}
          type="button"
          onClick={() => setPaused((value) => !value)}
          aria-label={paused ? "문장 모션 재생" : "문장 모션 일시정지"}
        >
          <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            {paused ? <path d="m5 3 8 5-8 5Z" /> : <path d="M4 3h3v10H4zm5 0h3v10H9z" />}
          </svg>
          <span>{paused ? "모션 재생" : "모션 일시정지"}</span>
        </button>
        <span className={styles.brand__reduced}>모션 줄임</span>
      </div>
    </div>
  );
}
