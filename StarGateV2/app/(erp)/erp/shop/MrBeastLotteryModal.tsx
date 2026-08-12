"use client";

import Image from "next/image";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { useRevealMrBeastLotteryClaim } from "@/hooks/mutations/useShopMutation";

import { MRBEAST_LOTTERY_SRC } from "@/lib/assets/shop";
import type {
  MrBeastLotteryPendingClaimDto,
  MrBeastLotteryRevealDto,
} from "@/lib/db/mrbeast-lottery";

import styles from "./MrBeastLotteryModal.module.css";

const SCRATCH_REVEAL_THRESHOLD = 0.65;
const SCRATCH_SAMPLE_STEP = 8;
const SCRATCH_BRUSH_SIZE = 46;
const LOTTERY_IMAGE_SRC = MRBEAST_LOTTERY_SRC;

interface Props {
  claim: MrBeastLotteryPendingClaimDto;
  onClose: (completed: boolean) => void;
}

function particleCount(result: MrBeastLotteryRevealDto | null): number {
  if (result?.tier === "zeroth") return 32;
  if (result?.tier === "first") return 14;
  if (result?.tier === "second") return 8;
  return 0;
}

function particleStyle(index: number): CSSProperties {
  return {
    "--particle-x": `${(index * 37) % 100}%`,
    "--particle-y": `${(index * 61) % 100}%`,
    "--particle-delay": `${(index % 8) * -0.13}s`,
  } as CSSProperties;
}

export default function MrBeastLotteryModal({ claim, onClose }: Props) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scratchingRef = useRef(false);
  const scratchMoveCountRef = useRef(0);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const revealStartedRef = useRef(false);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const isRevealPendingRef = useRef(false);
  const completedRef = useRef(false);

  const revealMutation = useRevealMrBeastLotteryClaim();

  const [coverage, setCoverage] = useState(0);
  const [result, setResult] = useState<MrBeastLotteryRevealDto | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
    isRevealPendingRef.current = revealMutation.isPending;
    completedRef.current = result !== null;
  }, [onClose, result, revealMutation.isPending]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !context) return;

    context.globalCompositeOperation = "source-over";
    const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, "#8b929a");
    gradient.addColorStop(0.45, "#e6ebef");
    gradient.addColorStop(1, "#737a84");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "rgba(18, 24, 31, 0.72)";
    context.font = "700 28px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("SCRATCH · 긁어주세요", canvas.width / 2, canvas.height / 2);
  }, [claim.claimId]);

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;

    function getFocusableElements(): HTMLElement[] {
      if (!dialogRef.current) return [];
      return Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      );
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (isRevealPendingRef.current) return;
        event.preventDefault();
        onCloseRef.current(completedRef.current);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = getFocusableElements();
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    requestAnimationFrame(() => getFocusableElements()[0]?.focus());
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, []);

  function revealClaim() {
    if (revealStartedRef.current || result) return;
    revealStartedRef.current = true;
    setErrorMessage(null);
    revealMutation.mutate(
      { claimId: claim.claimId },
      {
        onSuccess: (nextResult) => {
          setCoverage(1);
          setResult(nextResult);
        },
        onError: (error) => {
          revealStartedRef.current = false;
          setErrorMessage(error.message);
        },
      },
    );
  }

  function measureCoverage() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !context || revealStartedRef.current) return;

    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let cleared = 0;
    let sampled = 0;
    for (let y = 0; y < canvas.height; y += SCRATCH_SAMPLE_STEP) {
      for (let x = 0; x < canvas.width; x += SCRATCH_SAMPLE_STEP) {
        const alphaIndex = (y * canvas.width + x) * 4 + 3;
        sampled += 1;
        if ((pixels[alphaIndex] ?? 255) < 96) cleared += 1;
      }
    }
    const nextCoverage = sampled > 0 ? cleared / sampled : 0;
    setCoverage(nextCoverage);
    if (nextCoverage >= SCRATCH_REVEAL_THRESHOLD) revealClaim();
  }

  function scratchAt(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || result || revealMutation.isPending) return;

    const rect = canvas.getBoundingClientRect();
    const point = {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
    const previous = lastPointRef.current ?? point;
    context.globalCompositeOperation = "destination-out";
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = SCRATCH_BRUSH_SIZE;
    context.beginPath();
    context.moveTo(previous.x, previous.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    lastPointRef.current = point;
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    scratchingRef.current = true;
    scratchMoveCountRef.current = 0;
    lastPointRef.current = null;
    event.currentTarget.setPointerCapture(event.pointerId);
    scratchAt(event);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!scratchingRef.current) return;
    scratchAt(event);
    scratchMoveCountRef.current += 1;
    if (scratchMoveCountRef.current % 5 === 0) measureCoverage();
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLCanvasElement>) {
    scratchingRef.current = false;
    lastPointRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    measureCoverage();
  }

  const tierClass = result ? styles[`result--${result.tier}`] : "";
  const particles = particleCount(result);

  return (
    <div className={styles.overlay} role="presentation">
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>LIMITED EVENT</span>
            <h2 id={titleId}>미스터비스트 스크래치 복권</h2>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={() => onClose(result !== null)}
            disabled={revealMutation.isPending}
            aria-label="복권 닫기 — 진행 중인 복권은 다시 열 수 있습니다"
          >
            X
          </button>
        </header>

        <p id={descriptionId} className={styles.instructions}>
          마우스나 손가락으로 은박을 긁으세요. 약 65%를 긁으면 서버에 고정된
          결과가 공개됩니다. 닫아도 같은 복권을 이어서 열 수 있습니다.
        </p>

        <div className={`${styles.card} ${tierClass}`}>
          <div className={styles.card__art} aria-hidden>
            <Image
              src={LOTTERY_IMAGE_SRC}
              alt=""
              fill
              sizes="(max-width: 640px) 90vw, 600px"
              priority
            />
          </div>
          <div className={styles.card__result} aria-live="assertive">
            {result ? (
              <>
                <span>{result.label}</span>
                <strong>
                  {result.reward > 0
                    ? `+${result.reward.toLocaleString()} CR`
                    : "다음 기회에!"}
                </strong>
              </>
            ) : (
              <>
                <span>RESULT LOCKED</span>
                <strong>결과는 아직 공개되지 않았습니다</strong>
              </>
            )}
          </div>

          {Array.from({ length: particles }, (_, index) => (
            <span
              key={index}
              className={styles.particle}
              style={particleStyle(index)}
              aria-hidden
            />
          ))}

          <canvas
            ref={canvasRef}
            className={[
              styles.scratchCanvas,
              result ? styles["scratchCanvas--revealed"] : "",
            ]
              .filter(Boolean)
              .join(" ")}
            width={640}
            height={360}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
            aria-label={`복권 긁기 영역, ${Math.round(coverage * 100)}% 완료`}
          />
        </div>

        <div className={styles.progress}>
          <span>스크래치 진행률</span>
          <strong>{Math.round(coverage * 100)}%</strong>
        </div>

        {errorMessage ? (
          <p className={styles.error} role="alert">
            {errorMessage}
          </p>
        ) : null}

        <footer className={styles.footer}>
          {!result ? (
            <button
              type="button"
              className={styles.accessibleRevealButton}
              onClick={revealClaim}
              disabled={revealMutation.isPending}
            >
              {revealMutation.isPending
                ? "결과 확인 중"
                : "스크래치 대신 결과 확인"}
            </button>
          ) : (
            <button
              type="button"
              className={styles.doneButton}
              onClick={() => onClose(true)}
            >
              결과 확인 완료
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
