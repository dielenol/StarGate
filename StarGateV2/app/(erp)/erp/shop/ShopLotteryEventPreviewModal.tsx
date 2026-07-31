"use client";

import Image from "next/image";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import type { MrBeastLotteryTier } from "@/lib/shop/mrbeast-lottery";

import lotteryStyles from "./MrBeastLotteryModal.module.css";
import styles from "./ShopLotteryEventPreviewModal.module.css";

const POSTER_SRC =
  "/assets/shop/events/mrbeast-soda-lottery-poster.png";
const LOTTERY_IMAGE_SRC =
  "/assets/shop/events/mrbeast-lottery-transparent.png";
const SODA_IMAGE_SRC = "/assets/shop/items/mrbeast_soda.png";

type PreviewScene = "poster" | "locked" | MrBeastLotteryTier;

interface PreviewResult {
  label: string;
  reward: number;
  tier: MrBeastLotteryTier;
}

const PREVIEW_RESULTS: readonly PreviewResult[] = [
  { tier: "blank", label: "꽝", reward: 0 },
  { tier: "fifth", label: "5등", reward: 40 },
  { tier: "fourth", label: "4등", reward: 60 },
  { tier: "third", label: "3등", reward: 80 },
  { tier: "second", label: "2등", reward: 800 },
  { tier: "first", label: "1등", reward: 10_000 },
  { tier: "zeroth", label: "0등", reward: 100_000 },
] as const;

const SCENE_BUTTONS: ReadonlyArray<{
  key: PreviewScene;
  label: string;
}> = [
  { key: "poster", label: "이벤트 포스터" },
  { key: "locked", label: "긁기 전" },
  ...PREVIEW_RESULTS.map((result) => ({
    key: result.tier,
    label: result.label,
  })),
];

interface Props {
  onClose: () => void;
}

function particleCount(tier: MrBeastLotteryTier | null): number {
  if (tier === "zeroth") return 32;
  if (tier === "first") return 14;
  if (tier === "second") return 8;
  return 0;
}

function particleStyle(index: number): CSSProperties {
  return {
    "--particle-x": `${(index * 37) % 100}%`,
    "--particle-y": `${(index * 61) % 100}%`,
    "--particle-delay": `${(index % 8) * -0.13}s`,
  } as CSSProperties;
}

export default function ShopLotteryEventPreviewModal({ onClose }: Props) {
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [scene, setScene] = useState<PreviewScene>("poster");

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [onClose]);

  const result =
    scene === "poster" || scene === "locked"
      ? null
      : PREVIEW_RESULTS.find((entry) => entry.tier === scene) ?? null;
  const particles = particleCount(result?.tier ?? null);
  const tierClass = result
    ? lotteryStyles[`result--${result.tier}`]
    : "";

  return (
    <div className={lotteryStyles.overlay} role="presentation">
      <section
        className={`${lotteryStyles.dialog} ${styles.dialog}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className={lotteryStyles.header}>
          <div>
            <span className={lotteryStyles.eyebrow}>GM SAFE PREVIEW</span>
            <h2 id={titleId}>복권 이벤트 화면 미리보기</h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className={lotteryStyles.closeButton}
            onClick={onClose}
            aria-label="이벤트 화면 미리보기 닫기"
          >
            X
          </button>
        </header>

        <p className={lotteryStyles.instructions}>
          아래 버튼으로 플레이어에게 보이는 화면을 확인합니다. 복권 소모,
          추첨, 크레딧 지급, 이벤트 설정 저장은 발생하지 않습니다.
        </p>

        <div className={styles.sceneButtons} aria-label="미리보기 장면">
          {SCENE_BUTTONS.map((button) => (
            <button
              key={button.key}
              type="button"
              className={scene === button.key ? styles.sceneButtonActive : ""}
              aria-pressed={scene === button.key}
              onClick={() => setScene(button.key)}
            >
              {button.label}
            </button>
          ))}
        </div>

        {scene === "poster" ? (
          <section className={styles.posterPreview} aria-label="이벤트 포스터 미리보기">
            <div className={styles.posterPreview__art}>
              <Image
                src={POSTER_SRC}
                alt="미스터비스트 소다 구매 시 복권 지급 이벤트 포스터"
                fill
                sizes="(max-width: 640px) 42vw, 240px"
                priority
              />
            </div>
            <div className={styles.posterPreview__copy}>
              <span>LIMITED EVENT</span>
              <h3>소다 한 캔, 복권 한 장</h3>
              <p>
                이벤트 기간에 미스터비스트 소다를 구매하면 구매 수량만큼
                스크래치 복권을 즉시 지급합니다.
              </p>
              <div className={styles.itemPair} aria-label="지급 아이템">
                <Image src={SODA_IMAGE_SRC} alt="" width={64} height={64} />
                <strong>+</strong>
                <Image src={LOTTERY_IMAGE_SRC} alt="" width={64} height={64} />
              </div>
              <div className={styles.badges}>
                <span>소다 1개당 복권 1장</span>
                <span>하루 최대 10개</span>
                <strong>0등 100,000 CR</strong>
              </div>
            </div>
          </section>
        ) : (
          <>
            <div
              className={[
                lotteryStyles.card,
                tierClass,
                styles.card,
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <div className={lotteryStyles.card__art} aria-hidden>
                <Image
                  src={LOTTERY_IMAGE_SRC}
                  alt=""
                  fill
                  sizes="(max-width: 640px) 42vw, 280px"
                  priority
                />
              </div>
              <div className={lotteryStyles.card__result} aria-live="polite">
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
                  className={lotteryStyles.particle}
                  style={particleStyle(index)}
                  aria-hidden
                />
              ))}

              {scene === "locked" ? (
                <div className={styles.scratchCover} aria-hidden>
                  SCRATCH · 긁어주세요
                </div>
              ) : null}
            </div>
            <div className={styles.previewNote}>
              {result?.tier === "zeroth"
                ? "0등은 1등보다 강한 광원과 파티클 효과가 적용됩니다."
                : "실제 사용 화면과 같은 결과 카드 스타일입니다."}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
