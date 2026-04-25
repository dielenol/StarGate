"use client";

import { useEffect, useId, useRef, useState } from "react";

import Button from "@/components/ui/Button/Button";

import styles from "./DiffPreviewModal.module.css";

/**
 * P7 — 캐릭터 편집 저장 직전 diff 프리뷰.
 *
 * 사용자가 변경 사항을 한 번에 확인하고 의도하지 않은 수정을 자가 검열하도록 한다.
 * server PATCH 흐름은 변경 없이 그대로 유지 (모달 confirm → 기존 PATCH 경로 진입).
 */
export interface DiffEntry {
  field: string;
  before: unknown;
  after: unknown;
}

export interface CooldownInfo {
  used: number;
  remaining: number;
  maxCount: number;
  windowHours: number;
}

interface Props {
  diff: DiffEntry[];
  onConfirm: (reason?: string) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  mode: "admin" | "player";
  /** player 모드에서만 의미 — admin 은 쿨다운 미적용 */
  cooldown?: CooldownInfo;
}

/**
 * dot path 필드 키를 한국어 라벨로 매핑. 매핑되지 않은 키는 그대로 표시 (drift 안전).
 *
 * 매핑 누락이 있어도 기능은 동작 — UX 만 저하. 새 필드 추가 시 본 매핑에 등재.
 */
const FIELD_LABELS: Record<string, string> = {
  codename: "CODENAME",
  role: "ROLE",
  isPublic: "공개 여부",
  ownerId: "소유자 ID",
  previewImage: "프리뷰 이미지 URL",
  "sheet.name": "이름",
  "sheet.mainImage": "메인 이미지 URL",
  "sheet.posterImage": "포스터 이미지 URL",
  "sheet.quote": "인용문",
  "sheet.gender": "성별",
  "sheet.age": "나이",
  "sheet.height": "신장",
  "sheet.appearance": "외모",
  "sheet.personality": "성격",
  "sheet.background": "배경",
  "sheet.weight": "체중",
  "sheet.className": "직군",
  "sheet.hp": "HP",
  "sheet.san": "SAN",
  "sheet.def": "DEF",
  "sheet.atk": "ATK",
  "sheet.abilityType": "능력 타입",
  "sheet.credit": "크레딧",
  "sheet.weaponTraining": "무기 훈련",
  "sheet.skillTraining": "기술 훈련",
  "sheet.equipment": "장비",
  "sheet.abilities": "어빌리티",
  "sheet.nameEn": "이름(EN)",
  "sheet.roleDetail": "역할 상세",
  "sheet.notes": "비고",
};

/** 이미지 필드 — admin 모드에서만 등장 (player 화이트리스트엔 없음) */
const IMAGE_FIELDS = new Set<string>([
  "previewImage",
  "sheet.mainImage",
  "sheet.posterImage",
]);

function labelFor(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

/**
 * 표시용 텍스트로 변환. 객체/배열은 JSON 압축, 길이는 1024자에서 자른다 (Discord embed 제약과 동일).
 *
 * 변환 실패 시 fallback 으로 String(value) 사용 — 표시 자체는 항상 성공.
 */
function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return "(비어 있음)";
  if (typeof value === "string") return value || "(빈 문자열)";
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    const json = JSON.stringify(value, null, 2);
    return json.length > 1024 ? `${json.slice(0, 1024)}…` : json;
  } catch {
    return String(value);
  }
}

function isImageUrl(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    /^(https?:\/\/|\/)/i.test(value)
  );
}

export default function DiffPreviewModal({
  diff,
  onConfirm,
  onCancel,
  isSubmitting,
  mode,
  cooldown,
}: Props) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const [reason, setReason] = useState("");

  // 부모가 onCancel/isSubmitting 을 매 렌더 새 함수/값으로 만들어도
  // focus trap useEffect 가 재실행되어 포커스가 튕기지 않도록 ref 로 안정화.
  const onCancelRef = useRef(onCancel);
  const isSubmittingRef = useRef(isSubmitting);
  useEffect(() => {
    onCancelRef.current = onCancel;
    isSubmittingRef.current = isSubmitting;
  }, [onCancel, isSubmitting]);

  /**
   * Focus trap + ESC 닫기. mount/unmount 시점에만 등록 — deps 배열은 빈 배열.
   * 부모 렌더로 인한 재실행을 막아야 reason textarea 입력 중 포커스가
   * 첫 focusable 로 튕기지 않음 (M8 합의).
   */
  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;

    function getFocusableElements(): HTMLElement[] {
      if (!dialogRef.current) return [];
      const selector =
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
      return Array.from(dialogRef.current.querySelectorAll<HTMLElement>(selector));
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSubmittingRef.current) {
        event.preventDefault();
        onCancelRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const focusables = getFocusableElements();
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        if (active === first || !dialogRef.current?.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    // 초기 포커스 — 첫 focusable 요소 (취소 버튼이 보통 첫 번째)
    requestAnimationFrame(() => {
      const focusables = getFocusableElements();
      focusables[0]?.focus();
    });

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, []);

  function handleConfirm() {
    const trimmed = reason.trim();
    onConfirm(trimmed || undefined);
  }

  function handleOverlayClick(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget && !isSubmitting) {
      onCancel();
    }
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
        <header className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            변경 사항 확인
          </h2>
          <div className={styles.metaRow}>
            <span
              className={[
                styles.modeBadge,
                mode === "admin"
                  ? styles["modeBadge--admin"]
                  : styles["modeBadge--player"],
              ].join(" ")}
            >
              {mode === "admin" ? "관리자 편집" : "플레이어 편집"}
            </span>
            {cooldown ? (
              <span className={styles.cooldown}>
                최근 {cooldown.windowHours}시간 이내 {cooldown.used}/
                {cooldown.maxCount}회 사용 (남은 {cooldown.remaining}회)
              </span>
            ) : null}
          </div>
        </header>

        <div className={styles.body}>
          {diff.length === 0 ? (
            <p className={styles.empty}>변경 사항이 없습니다.</p>
          ) : (
            <ul className={styles.diffList}>
              {diff.map((entry) => (
                <DiffRow key={entry.field} entry={entry} />
              ))}
            </ul>
          )}

          <label className={styles.reasonLabel} htmlFor="diff-reason">
            <span>변경 사유 (선택)</span>
            <textarea
              id="diff-reason"
              className={styles.reasonTextarea}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                mode === "admin"
                  ? "관리자 편집 사유를 남겨두면 audit/롤백 시 추적이 쉬워집니다."
                  : "필요 시 변경 사유를 남겨주세요."
              }
              disabled={isSubmitting}
              rows={3}
            />
          </label>
        </div>

        <footer className={styles.footer}>
          <Button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            취소
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleConfirm}
            disabled={isSubmitting || diff.length === 0}
          >
            {isSubmitting ? "저장 중..." : "저장"}
          </Button>
        </footer>
      </div>
    </div>
  );
}

/* ── Row ── */

function DiffRow({ entry }: { entry: DiffEntry }) {
  const { field, before, after } = entry;
  const label = labelFor(field);
  const isImage =
    IMAGE_FIELDS.has(field) && (isImageUrl(before) || isImageUrl(after));

  return (
    <li className={styles.row}>
      <div className={styles.row__head}>
        <span className={styles.row__label}>{label}</span>
        <span className={styles.row__field} aria-hidden="true">
          {field}
        </span>
      </div>
      {isImage ? (
        <div className={styles.imageCompare}>
          <ImageCell label="이전" value={before} />
          <span className={styles.arrow} aria-hidden="true">
            →
          </span>
          <ImageCell label="이후" value={after} />
        </div>
      ) : (
        <div className={styles.textCompare}>
          <ValueCell variant="before" value={before} />
          <span className={styles.arrow} aria-hidden="true">
            →
          </span>
          <ValueCell variant="after" value={after} />
        </div>
      )}
    </li>
  );
}

function ValueCell({
  variant,
  value,
}: {
  variant: "before" | "after";
  value: unknown;
}) {
  return (
    <div
      className={[
        styles.valueCell,
        variant === "before"
          ? styles["valueCell--before"]
          : styles["valueCell--after"],
      ].join(" ")}
    >
      <span className={styles.valueCell__caption}>
        {variant === "before" ? "이전" : "이후"}
      </span>
      <pre className={styles.valueCell__text}>{stringifyValue(value)}</pre>
    </div>
  );
}

function ImageCell({ label, value }: { label: string; value: unknown }) {
  const url = isImageUrl(value) ? value : null;
  return (
    <div className={styles.imageCell}>
      <span className={styles.valueCell__caption}>{label}</span>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={`${label} 이미지`}
          className={styles.imageCell__img}
        />
      ) : (
        <span className={styles.imageCell__empty}>(비어 있음)</span>
      )}
    </div>
  );
}
