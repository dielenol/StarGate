"use client";

import { useEffect, useId, useRef } from "react";

import {
  AGENT_LEVELS,
  AGENT_LEVEL_LABELS,
  type AgentLevel,
} from "@/types/character";

import Button from "@/components/ui/Button/Button";

import styles from "./ClearanceGuideModal.module.css";

interface Props {
  /** 현재 사용자의 권한 등급. 해당 row 를 강조한다. */
  current?: AgentLevel;
  onClose: () => void;
}

/** 권한 등급별 한 줄 설명 (dossier 톤). AGENT_LEVELS(GM 제외 7단) 키만 사용. */
const LEVEL_DESC: Record<Exclude<AgentLevel, "GM">, string> = {
  V: "전 영역 접근",
  A: "전체 부서 관리 권한",
  M: "단일 부서 관리 권한",
  H: "특수 작전 수행 권한",
  G: "일반 작전 수행 권한 · 실명 열람",
  J: "기본 현장 권한",
  U: "임시 단말 권한",
};

/**
 * 권한 등급 안내 모달.
 *
 * 책임:
 * - 7단 권한 등급(V/A/M/H/G/J/U) 별 한 줄 설명 노출
 * - 현재 사용자 등급 row 강조 (data-rank → globals.css 의 rank 팔레트 자동 적용)
 * - 정책 안내: 본인 등급 이상 필드만 노출 + CLASSIFIED 마스킹
 * - ESC / overlay click / 닫기 버튼으로 종료, body 스크롤 락
 */
export default function ClearanceGuideModal({ current, onClose }: Props) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
      }
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className={styles.overlay}
      onClick={handleOverlayClick}
      role="presentation"
    >
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <span
          className={`${styles.dialog__tick} ${styles["dialog__tick--tl"]}`}
          aria-hidden
        />
        <span
          className={`${styles.dialog__tick} ${styles["dialog__tick--tr"]}`}
          aria-hidden
        />
        <span
          className={`${styles.dialog__tick} ${styles["dialog__tick--bl"]}`}
          aria-hidden
        />
        <span
          className={`${styles.dialog__tick} ${styles["dialog__tick--br"]}`}
          aria-hidden
        />

        <header className={styles.header}>
          <h2 id={titleId} className={styles.header__title}>
            권한 등급 안내
          </h2>
          <p className={styles.header__sub}>
            권한 등급 7단 계층. 신원 조회 화면에서는 본인 등급 이상 필드만
            노출됩니다.
          </p>
        </header>

        <div className={styles.body}>
          <ul className={styles.levelList}>
            {AGENT_LEVELS.map((lv) => {
              const isActive = lv === current;
              const cls = [
                styles.levelRow,
                isActive ? styles["levelRow--active"] : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <li key={lv} className={cls} data-rank={lv}>
                  <span className={styles.levelRow__code}>{lv}</span>
                  <span className={styles.levelRow__label}>
                    {AGENT_LEVEL_LABELS[lv]}
                  </span>
                  <span className={styles.levelRow__desc}>
                    {LEVEL_DESC[lv]}
                  </span>
                  {isActive ? (
                    <span className={styles.levelRow__youTag}>현재</span>
                  ) : null}
                </li>
              );
            })}
          </ul>

          <div className={styles.notice}>
            <span className={styles.notice__lbl}>정책</span>
            <span className={styles.notice__body}>
              <span>
                본인 등급 이상 필드는{" "}
                <span className={styles.classified}>CLASSIFIED</span> 로
                마스킹되어 노출됩니다.
              </span>
              <span>실명 열람은 G 이상부터 가능합니다.</span>
            </span>
          </div>
        </div>

        <footer className={styles.footer}>
          <Button onClick={onClose}>닫기</Button>
        </footer>
      </div>
    </div>
  );
}
