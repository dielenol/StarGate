"use client";

import { useEffect, useId, useRef, useState } from "react";
import DiffMatchPatch from "diff-match-patch";

import { preferOptimizedPublicImagePath } from "@/lib/asset-path";

import {
  CHARACTER_IMAGE_FIELDS,
  labelForCharacterField,
} from "./_field-labels";

import styles from "./DiffPreviewModal.module.css";

/**
 * P7 — 캐릭터 편집 저장 직전 diff 프리뷰 (Claude Design 슬롯 7).
 *
 * 사용자가 변경 사항을 한 번에 확인하고 의도하지 않은 수정을 자가 검열하도록 한다.
 * server PATCH 흐름은 변경 없이 그대로 유지 (모달 confirm → 기존 PATCH 경로 진입).
 *
 * 디자인 톤: 군사 결재 양식 (FORM-04). PosterHero 의 더블 보더 / 코너 틱 패턴 계승.
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
  /** 헤더 docId 표시용 (선택) — 예: "박예솔 / BIG BOY" */
  characterLabel?: string;
}

function labelFor(field: string): string {
  return labelForCharacterField(field);
}

/**
 * 표시용 텍스트로 변환. 객체/배열은 JSON 압축, 길이는 1024자에서 자른다 (Discord embed 제약과 동일).
 *
 * 변환 실패 시 fallback 으로 String(value) 사용 — 표시 자체는 항상 성공.
 */
type DiffOp = -1 | 0 | 1;

interface TextDiffChunk {
  op: DiffOp;
  text: string;
}

const DIFF_DELETE: DiffOp = -1;
const DIFF_EQUAL: DiffOp = 0;
const DIFF_INSERT: DiffOp = 1;
const STAT_DELTA_FIELDS = new Set([
  "play.hpDelta",
  "play.sanDelta",
  "play.defDelta",
  "play.atkDelta",
]);

interface PreviewAbility {
  slot: string;
  name: string;
  code: string;
  description: string;
  effect: string;
}

function isSpecialPreviewField(field: string): boolean {
  return (
    field === "play.points" ||
    field === "play.abilities" ||
    STAT_DELTA_FIELDS.has(field)
  );
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatSignedInteger(value: number): string {
  if (value > 0) return `+${Math.trunc(value)}`;
  return String(Math.trunc(value));
}

function formatScalar(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value) ?? String(value);
}

function formatAbilityList(value: unknown): string | null {
  if (!Array.isArray(value)) return null;

  return value
    .map((entry, index) => {
      if (entry === null || typeof entry !== "object") {
        return `#${index + 1} ${formatScalar(entry)}`;
      }

      const ability = entry as Record<string, unknown>;
      const slot = formatScalar(ability.slot);
      const name = formatScalar(ability.name);
      const code = formatScalar(ability.code);
      const description = formatScalar(ability.description);
      const effect = formatScalar(ability.effect);
      const lines = [`${slot ? `[${slot}] ` : ""}${name || "(이름 없음)"}`];

      if (code) lines.push(`  code: ${code}`);
      if (description) lines.push(`  description: ${description}`);
      if (effect) lines.push(`  effect: ${effect}`);
      return lines.join("\n");
    })
    .join("\n\n");
}

function normalizeAbility(value: unknown, fallbackSlot: string): PreviewAbility {
  if (value === null || typeof value !== "object") {
    return {
      slot: fallbackSlot,
      name: "",
      code: "",
      description: "",
      effect: "",
    };
  }

  const ability = value as Record<string, unknown>;
  return {
    slot: formatScalar(ability.slot) || fallbackSlot,
    name: formatScalar(ability.name).trim(),
    code: formatScalar(ability.code).trim(),
    description: formatScalar(ability.description).trim(),
    effect: formatScalar(ability.effect).trim(),
  };
}

function abilityHasContent(ability: PreviewAbility): boolean {
  return Boolean(
    ability.name || ability.code || ability.description || ability.effect,
  );
}

function abilityText(ability: PreviewAbility): string {
  if (!abilityHasContent(ability)) return "";
  const lines = [`[${ability.slot}] ${ability.name || "(이름 없음)"}`];
  if (ability.code) lines.push(`code: ${ability.code}`);
  if (ability.description) lines.push(`description: ${ability.description}`);
  if (ability.effect) lines.push(`effect: ${ability.effect}`);
  return lines.join("\n");
}

function abilityMap(value: unknown): Map<string, PreviewAbility> {
  const map = new Map<string, PreviewAbility>();
  if (!Array.isArray(value)) return map;

  value.forEach((entry, index) => {
    const ability = normalizeAbility(entry, `#${index + 1}`);
    if (abilityHasContent(ability)) {
      map.set(ability.slot, ability);
    }
  });
  return map;
}

function stringifyPreviewValue(field: string, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (field === "play.abilities") {
    const formatted = formatAbilityList(value);
    if (formatted !== null) return formatted;
  }
  if (Array.isArray(value)) {
    return value.map((item) => `- ${formatScalar(item)}`).join("\n");
  }
  try {
    const json = JSON.stringify(value, null, 2);
    return json.length > 6000 ? `${json.slice(0, 6000)}...` : json;
  } catch {
    return String(value);
  }
}

function buildTextDiff(beforeText: string, afterText: string): TextDiffChunk[] {
  const dmp = new DiffMatchPatch();
  dmp.Diff_Timeout = 0.4;

  const useLineMode =
    beforeText.includes("\n") ||
    afterText.includes("\n") ||
    beforeText.length + afterText.length > 240;

  let rawDiff: Array<[number, string]>;
  if (useLineMode) {
    const encoded = dmp.diff_linesToChars_(beforeText, afterText);
    rawDiff = dmp.diff_main(encoded.chars1, encoded.chars2, false);
    dmp.diff_charsToLines_(rawDiff, encoded.lineArray);
  } else {
    rawDiff = dmp.diff_main(beforeText, afterText, true);
  }

  dmp.diff_cleanupSemantic(rawDiff);
  return rawDiff
    .filter(([, text]) => text.length > 0)
    .map(([op, text]) => ({
      op:
        op === DIFF_DELETE
          ? DIFF_DELETE
          : op === DIFF_INSERT
            ? DIFF_INSERT
            : DIFF_EQUAL,
      text,
    }));
}

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.length === 0;
  return false;
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
  characterLabel,
}: Props) {
  const titleId = useId();
  const reasonId = useId();
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
   * 첫 focusable 로 튕기지 않음.
   */
  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;

    function getFocusableElements(): HTMLElement[] {
      if (!dialogRef.current) return [];
      const selector =
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
      return Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(selector),
      );
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

  // cooldown 진행도 — used / maxCount (0 ~ 100)
  const cooldownPct = cooldown
    ? Math.min(100, Math.round((cooldown.used / cooldown.maxCount) * 100))
    : 0;

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
          <div className={styles.eyebrow}>FORM-04 · CHARACTER REVISION</div>
          <h2 id={titleId} className={styles.title}>
            <span className={styles.title__seal}>§</span>변경 사항 확인
          </h2>
          <div className={styles.metaRow}>
            <div className={styles.metaRow__left}>
              <span
                className={`${styles.modeBadge} ${
                  mode === "admin"
                    ? styles["modeBadge--admin"]
                    : styles["modeBadge--player"]
                }`}
              >
                {mode === "admin" ? "ADMIN" : "PLAYER"}
              </span>
              {characterLabel ? (
                <span className={styles.docId}>
                  DOC <b>{characterLabel}</b>
                </span>
              ) : null}
            </div>
            {cooldown ? (
              <div
                className={styles.cooldown}
                aria-label={`최근 ${cooldown.windowHours}시간 편집 ${cooldown.used} / ${cooldown.maxCount}`}
              >
                최근 {cooldown.windowHours}시간 편집{" "}
                <span className={styles.cooldown__num}>{cooldown.used}</span>
                <span className={styles.cooldown__sep}>/</span>
                <span className={styles.cooldown__total}>
                  {cooldown.maxCount}
                </span>
                <span className={styles.cooldown__bar} aria-hidden>
                  <span
                    className={styles.cooldown__barFill}
                    style={{ width: `${cooldownPct}%` }}
                  />
                </span>
              </div>
            ) : null}
          </div>
        </header>

        <div className={styles.body}>
          <div className={styles.summary}>
            <div className={styles.summary__count}>
              변경 항목 <b>{diff.length}</b>
            </div>
            <div className={styles.summary__hint}>감사 로그 자동 기록</div>
          </div>

          {diff.length === 0 ? (
            <p className={styles.empty}>변경 사항이 없습니다.</p>
          ) : (
            <ul className={styles.diffList}>
              {diff.map((entry, index) => (
                <DiffRow
                  key={entry.field}
                  index={index + 1}
                  entry={entry}
                />
              ))}
            </ul>
          )}
        </div>

        <div className={styles.reasonBlock}>
          <label className={styles.reasonLabel} htmlFor={reasonId}>
            <span>변경 사유</span>
            <span className={styles.reasonLabel__optional}>OPTIONAL</span>
          </label>
          <textarea
            id={reasonId}
            className={styles.reasonTextarea}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="변경 이유를 간단히 적어 주세요 (선택) — Discord GM 채널에 함께 기록됩니다."
            disabled={isSubmitting}
          />
        </div>

        <footer className={styles.footer}>
          <div className={styles.footer__notice}>
            감사 로그 · Discord GM 채널 알림
          </div>
          <div className={styles.footer__actions}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={onCancel}
              disabled={isSubmitting}
            >
              취소
            </button>
            <button
              type="button"
              className={styles.submitBtn}
              onClick={handleConfirm}
              disabled={isSubmitting || diff.length === 0}
              aria-busy={isSubmitting}
            >
              {isSubmitting ? "저장 중" : "저장 확인"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

/* ── Row ── */

function DiffRow({ index, entry }: { index: number; entry: DiffEntry }) {
  const { field, before, after } = entry;
  const label = labelFor(field);
  const isImage =
    CHARACTER_IMAGE_FIELDS.has(field) &&
    (isImageUrl(before) || isImageUrl(after));
  const indexStr = String(index).padStart(2, "0");
  const showFieldPath = !isSpecialPreviewField(field);

  return (
    <li className={styles.row}>
      <div className={styles.row__head}>
        <div>
          <span className={styles.row__index}>{indexStr}</span>
          <span className={styles.row__label}>{label}</span>
        </div>
        {showFieldPath ? (
          <span className={styles.row__field} aria-hidden="true">
            {field}
          </span>
        ) : null}
      </div>
      {field === "play.points" ? (
        <PointSpendPreview before={before} after={after} />
      ) : STAT_DELTA_FIELDS.has(field) ? (
        <StatDeltaPreview value={after} />
      ) : field === "play.abilities" ? (
        <AbilityDiff before={before} after={after} />
      ) : isImage ? (
        <div className={styles.imageCompare}>
          <ImageCell variant="before" value={before} />
          <span className={styles.arrow} aria-hidden="true">
            →
          </span>
          <ImageCell variant="after" value={after} />
          <ImageMeta before={before} after={after} field={field} />
        </div>
      ) : (
        <TextDiff field={field} before={before} after={after} />
      )}
    </li>
  );
}

function TextDiff({
  field,
  before,
  after,
}: {
  field: string;
  before: unknown;
  after: unknown;
}) {
  const beforeText = stringifyPreviewValue(field, before);
  const afterText = stringifyPreviewValue(field, after);
  const chunks = buildTextDiff(beforeText, afterText);
  const emptyBefore = isEmptyValue(before);
  const emptyAfter = isEmptyValue(after);

  return (
    <div className={styles.textDiff}>
      <div className={styles.textDiff__legend} aria-hidden="true">
        <span className={styles.textDiff__legendDelete}>삭제</span>
        <span className={styles.textDiff__legendInsert}>추가</span>
      </div>
      <div
        className={[
          styles.textDiff__body,
          emptyBefore || emptyAfter ? styles["textDiff__body--hasEmpty"] : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {chunks.length === 0 ? (
          <span className={styles.textDiff__empty}>(변경 없음)</span>
        ) : (
          chunks.map((chunk, index) => (
            <span
              // diff-match-patch chunks are positional, so index is stable for this preview render.
              key={`${chunk.op}-${index}`}
              className={[
                styles.textDiff__chunk,
                chunk.op === DIFF_DELETE
                  ? styles["textDiff__chunk--delete"]
                  : chunk.op === DIFF_INSERT
                    ? styles["textDiff__chunk--insert"]
                    : styles["textDiff__chunk--equal"],
              ].join(" ")}
            >
              {chunk.text}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

function PointSpendPreview({
  before,
  after,
}: {
  before: unknown;
  after: unknown;
}) {
  const beforePoints = asNumber(before);
  const afterPoints = asNumber(after);
  const spent = beforePoints - afterPoints;
  const isSpend = spent >= 0;

  return (
    <div className={styles.pointPreview}>
      <div className={styles.pointPreview__main}>
        <span>{isSpend ? "사용 포인트" : "추가 포인트"}</span>
        <b
          className={
            isSpend
              ? styles["pointPreview__amount--spend"]
              : styles["pointPreview__amount--gain"]
          }
        >
          {Math.abs(spent)}
        </b>
      </div>
      <div className={styles.pointPreview__meta}>
        <span>현재 잔여 {beforePoints}</span>
        <span>저장 후 잔여 {afterPoints}</span>
      </div>
      <p>보너스 포인트는 능력치, 스킬, 훈련 추가에 소모됩니다.</p>
    </div>
  );
}

function StatDeltaPreview({ value }: { value: unknown }) {
  const delta = asNumber(value);
  const tone =
    delta > 0
      ? styles["statDeltaPreview--up"]
      : delta < 0
        ? styles["statDeltaPreview--down"]
        : styles["statDeltaPreview--zero"];

  return (
    <div className={styles.statDeltaPreview}>
      <span className={tone}>{formatSignedInteger(delta)}</span>
    </div>
  );
}

function AbilityDiff({
  before,
  after,
}: {
  before: unknown;
  after: unknown;
}) {
  const beforeMap = abilityMap(before);
  const afterMap = abilityMap(after);
  const slots = Array.from(new Set([...beforeMap.keys(), ...afterMap.keys()]));
  const changed = slots
    .map((slot) => {
      const beforeText = abilityText(
        beforeMap.get(slot) ?? normalizeAbility(null, slot),
      );
      const afterText = abilityText(
        afterMap.get(slot) ?? normalizeAbility(null, slot),
      );
      return beforeText === afterText ? null : { slot, beforeText, afterText };
    })
    .filter(
      (
        item,
      ): item is { slot: string; beforeText: string; afterText: string } =>
        item !== null,
    );

  if (changed.length === 0) {
    return <div className={styles.textDiff__empty}>변경된 어빌리티 없음</div>;
  }

  return (
    <div className={styles.abilityDiff}>
      {changed.map((item) => {
        const chunks = buildTextDiff(item.beforeText, item.afterText);
        return (
          <div className={styles.abilityDiff__item} key={item.slot}>
            <div className={styles.abilityDiff__slot}>{item.slot}</div>
            <div className={styles.abilityDiff__body}>
              {chunks.map((chunk, index) => (
                <span
                  key={`${item.slot}-${chunk.op}-${index}`}
                  className={[
                    styles.textDiff__chunk,
                    chunk.op === DIFF_DELETE
                      ? styles["textDiff__chunk--delete"]
                      : chunk.op === DIFF_INSERT
                        ? styles["textDiff__chunk--insert"]
                        : styles["textDiff__chunk--equal"],
                  ].join(" ")}
                >
                  {chunk.text}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ImageCell({
  variant,
  value,
}: {
  variant: "before" | "after";
  value: unknown;
}) {
  const url = isImageUrl(value) ? value : null;
  const tagText = variant === "before" ? "BEFORE" : "AFTER";

  return (
    <div
      className={[
        styles.imageCell,
        variant === "before"
          ? styles["imageCell--before"]
          : styles["imageCell--after"],
        !url ? styles["imageCell--empty"] : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className={styles.imageCell__tag}>{tagText}</span>
      <span
        className={`${styles.imageCell__tick} ${styles["imageCell__tick--tl"]}`}
        aria-hidden
      />
      <span
        className={`${styles.imageCell__tick} ${styles["imageCell__tick--tr"]}`}
        aria-hidden
      />
      <span
        className={`${styles.imageCell__tick} ${styles["imageCell__tick--bl"]}`}
        aria-hidden
      />
      <span
        className={`${styles.imageCell__tick} ${styles["imageCell__tick--br"]}`}
        aria-hidden
      />
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preferOptimizedPublicImagePath(url)} alt={`${tagText} 이미지`} />
      ) : (
        <span>(비어 있음)</span>
      )}
    </div>
  );
}

function ImageMeta({
  before,
  after,
  field,
}: {
  before: unknown;
  after: unknown;
  field: string;
}) {
  const beforeUrl = isImageUrl(before) ? before : null;
  const afterUrl = isImageUrl(after) ? after : null;
  const fileFromUrl = (url: string | null): string | null => {
    if (!url) return null;
    const idx = url.lastIndexOf("/");
    return idx >= 0 ? url.slice(idx + 1) : url;
  };
  const beforeFile = fileFromUrl(beforeUrl);
  const afterFile = fileFromUrl(afterUrl);

  return (
    <div className={styles.imageMeta}>
      <b>{labelFor(field)}</b>
      <br />
      <span className={styles.imageMeta__path}>{field}</span>
      <br />
      {beforeFile || afterFile ? (
        <>
          {beforeFile ? `BEFORE · ${beforeFile}` : "BEFORE · (비어 있음)"}
          <br />
          {afterFile ? `AFTER · ${afterFile}` : "AFTER · (비어 있음)"}
        </>
      ) : null}
    </div>
  );
}
