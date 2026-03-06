"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import frameStyles from "../../page.module.css";
import styles from "./player.module.css";
import CharacterSheet, { type CharacterSheetData } from "./components/CharacterSheet";
import agentsData from "./data/agents.json";

type Agent = {
  id: string;
  codename: string;
  role: string;
  previewImage: string;
  pixelCharacterImage: string;
  warningVideo?: string;
  sheet: CharacterSheetData;
};

const AGENTS = agentsData as Agent[];
const BIG_BOY_AGENT_ID = "agent-bigboy";
const BIG_BOY_WARNING_CHANCE = 0.2;
const BIG_BOY_WARNING_MAX_PER_DAY = 3;
const BIG_BOY_WARNING_STORAGE_KEY = "stargate-bigboy-warning-state";
const WARNING_DURATION_MS = 1700;
const RECOVERY_DURATION_MS = 1600;
const RECOVERY_SOUND_DURATION_MS = 1300;

export default function PlayerPage() {
  const [selectedAgentId, setSelectedAgentId] = useState(AGENTS[0]?.id ?? "");
  const [warningPhase, setWarningPhase] = useState<"idle" | "warning" | "video" | "recovery">("idle");
  const selectedAgent = AGENTS.find((agent) => agent.id === selectedAgentId) ?? AGENTS[0];
  const warningTimeoutRef = useRef<number | null>(null);
  const recoverySoundTimeoutRef = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const warningAudioRef = useRef<HTMLAudioElement | null>(null);
  const recoveryAudioRef = useRef<HTMLAudioElement | null>(null);
  const paperAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (warningPhase !== "video" || !videoRef.current) {
      return;
    }

    if (warningAudioRef.current) {
      warningAudioRef.current.pause();
      warningAudioRef.current.currentTime = 0;
    }

    const videoElement = videoRef.current;
    void videoElement.play().catch(() => undefined);
  }, [warningPhase]);

  useEffect(() => {
    return () => {
      if (warningTimeoutRef.current) {
        window.clearTimeout(warningTimeoutRef.current);
      }

      if (recoverySoundTimeoutRef.current) {
        window.clearTimeout(recoverySoundTimeoutRef.current);
      }
    };
  }, []);

  function closeBigBoySequence() {
    if (warningTimeoutRef.current) {
      window.clearTimeout(warningTimeoutRef.current);
      warningTimeoutRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }

    if (warningAudioRef.current) {
      warningAudioRef.current.pause();
      warningAudioRef.current.currentTime = 0;
    }

    if (recoveryAudioRef.current) {
      recoveryAudioRef.current.pause();
      recoveryAudioRef.current.currentTime = 0;
    }

    if (recoverySoundTimeoutRef.current) {
      window.clearTimeout(recoverySoundTimeoutRef.current);
      recoverySoundTimeoutRef.current = null;
    }

    setWarningPhase("idle");
  }

  function handleBigBoyVideoEnd() {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }

    if (recoveryAudioRef.current) {
      recoveryAudioRef.current.volume = 0.15;
      recoveryAudioRef.current.currentTime = 0;
      void recoveryAudioRef.current.play().catch(() => undefined);

      if (recoverySoundTimeoutRef.current) {
        window.clearTimeout(recoverySoundTimeoutRef.current);
      }

      recoverySoundTimeoutRef.current = window.setTimeout(() => {
        if (recoveryAudioRef.current) {
          recoveryAudioRef.current.pause();
          recoveryAudioRef.current.currentTime = 0;
        }

        recoverySoundTimeoutRef.current = null;
      }, RECOVERY_SOUND_DURATION_MS);
    }

    setWarningPhase("recovery");
    warningTimeoutRef.current = window.setTimeout(() => {
      setWarningPhase("idle");
      warningTimeoutRef.current = null;
    }, RECOVERY_DURATION_MS);
  }

  function handleAgentSelect(agent: Agent) {
    if (agent.id === selectedAgentId) {
      return;
    }

    setSelectedAgentId(agent.id);

    if (paperAudioRef.current) {
      paperAudioRef.current.volume = 0.5;
      paperAudioRef.current.currentTime = 0;
      void paperAudioRef.current.play().catch(() => undefined);
    }

    if (agent.id !== BIG_BOY_AGENT_ID || !agent.warningVideo) {
      closeBigBoySequence();
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const storedState = window.localStorage.getItem(BIG_BOY_WARNING_STORAGE_KEY);
    let triggerCount = 0;

    if (storedState) {
      try {
        const parsedState = JSON.parse(storedState) as { date?: string; count?: number };
        if (parsedState.date === today && typeof parsedState.count === "number") {
          triggerCount = parsedState.count;
        }
      } catch {
        triggerCount = 0;
      }
    }

    if (triggerCount >= BIG_BOY_WARNING_MAX_PER_DAY) {
      closeBigBoySequence();
      return;
    }

    const randomBuffer = new Uint32Array(1);
    window.crypto.getRandomValues(randomBuffer);
    const isFirstTrigger = triggerCount === 0;
    const shouldTriggerWarning =
      isFirstTrigger || randomBuffer[0] / 4294967296 < BIG_BOY_WARNING_CHANCE;

    if (!shouldTriggerWarning) {
      closeBigBoySequence();
      return;
    }

    window.localStorage.setItem(
      BIG_BOY_WARNING_STORAGE_KEY,
      JSON.stringify({ date: today, count: triggerCount + 1 }),
    );

    if (warningTimeoutRef.current) {
      window.clearTimeout(warningTimeoutRef.current);
    }

    setWarningPhase("warning");
    if (warningAudioRef.current) {
      warningAudioRef.current.volume = 0.15;
      warningAudioRef.current.currentTime = 0;
      void warningAudioRef.current.play().catch(() => undefined);
    }
    warningTimeoutRef.current = window.setTimeout(() => {
      setWarningPhase("video");
      warningTimeoutRef.current = null;
    }, WARNING_DURATION_MS);
  }

  return (
    <main className={frameStyles["stargate-page"]}>
      <div className={frameStyles.stargate}>
        <div className={frameStyles.stargate__frame}>
          <div className={frameStyles.stargate__classification}>
            CLASSIFICATION: PERSONNEL ARCHIVE // AGENT DOSSIER
          </div>

          <section className={styles.hero}>
            <span className={frameStyles.stargate__est}>AGENT SELECT</span>
            <h1 className={styles.hero__title}>현장 요원 아카이브</h1>
            <div className={frameStyles.stargate__ornament}>✥</div>
            <p className={styles.hero__description}>
              상단 포트레이트를 선택하면 해당 요원의 상세 기록이 아래 패널에 표시됩니다.
            </p>
          </section>

          <div className={frameStyles.stargate__divider}></div>

          <section className={styles.selectGrid} aria-label="요원 선택">
            {AGENTS.map((agent) => {
              const active = selectedAgent?.id === agent.id;

              return (
                <button
                  aria-pressed={active}
                  className={`${styles.card} ${active ? styles["card--active"] : ""}`}
                  key={agent.id}
                  onClick={() => handleAgentSelect(agent)}
                  type="button"
                >
                  <div className={styles.card__frame}>
                    {active ? <div className={styles.card__status}>열람 중</div> : null}
                    <Image
                      className={styles.card__portrait}
                      src={agent.previewImage}
                      alt={`${agent.codename} 프로필 프리뷰`}
                      width={440}
                      height={440}
                      loading="lazy"
                    />
                    <div className={styles.card__pixelBadge} aria-hidden="true">
                      <Image
                        className={styles.card__pixelCharacter}
                        src={agent.pixelCharacterImage}
                        alt=""
                        width={96}
                        height={96}
                        loading="lazy"
                      />
                    </div>
                  </div>
                  <div className={styles.card__meta}>
                    <span className={styles.card__name}>{agent.codename}</span>
                    <span className={styles.card__role}>{agent.role}</span>
                  </div>
                </button>
              );
            })}
          </section>

          <section className={styles.sheets}>
            {selectedAgent ? <CharacterSheet key={selectedAgent.id} record={selectedAgent.sheet} /> : null}
          </section>

          <div className={frameStyles["stargate__cta-row"]}>
            <Link className={frameStyles["stargate__cta-link"]} href="/world">
              <div className={frameStyles["stargate__cta-outer"]}>
                <div className={frameStyles["stargate__cta-inner"]}>
                  <div className={frameStyles["stargate__cta-icon"]}>↩</div>
                  <div className={frameStyles["stargate__cta-title"]}>세계관 메인으로</div>
                  <div className={frameStyles["stargate__cta-subtitle"]}>RETURN TO INDEX</div>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </div>

      <audio
        ref={warningAudioRef}
        src="/sound/181328__boulderdamstudios__special-marine-warning.wav"
        preload="auto"
      />
      <audio
        ref={recoveryAudioRef}
        src="/sound/171223__ashowal__repairs-complete.wav"
        preload="auto"
      />
      <audio
        ref={paperAudioRef}
        src="/sound/651514__1bob__paper.wav"
        preload="auto"
      />

      {warningPhase === "warning" ? (
        <div className={styles.securityOverlay} aria-live="assertive" role="alertdialog">
          <div className={styles.securityOverlay__noise} aria-hidden="true" />
          <div className={styles.securityOverlay__scanline} aria-hidden="true" />
          <div className={styles.securityOverlay__glitch} aria-hidden="true">
            SIGNAL BREACH DETECTED
          </div>

          <div className={styles.securityPopup}>
            <div className={styles.securityPopup__header}>
              <span className={styles.securityPopup__logo}>N.O.S.B</span>
              <span className={styles.securityPopup__title}>INTELLIGENCE & ANOMALY CONTROL</span>
            </div>

            <div className={styles.securityPopup__content}>
              <div className={styles.securityPopup__warning}>SECURITY BREACH</div>
              <div className={styles.securityPopup__message}>
                비인가된 접근 토큰이 인물 기록 노드에 주입되었습니다.
                <br />
                메모리 덤프 및 시각 계층 변조가 감지되어 방어 프로토콜이 강제 실행됩니다.
                <br />
                격리 대상: BIG BOY / 박애솔
                <br />
                임시 차폐막 전개 중. 단말 제어권이 복구될 때까지 현 상태를 유지하십시오.
              </div>

              <div className={styles.securityPopup__info}>
                <div>
                  NODE <span>WORLD/PLAYER/ENTITY-07</span>
                </div>
                <div>
                  FLAG <span>UNAUTHORIZED VISUAL INJECTION</span>
                </div>
                <div>
                  STATUS <span>COUNTER-INTRUSION ACTIVE</span>
                </div>
                <div>
                  ACTION <span>SYSTEM LOCKDOWN / TRACE ROUTE</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {warningPhase === "video" && selectedAgent?.warningVideo ? (
        <div className={styles.videoOverlay} role="dialog" aria-modal="true" aria-label="빅보이 보안 영상">
          <div className={styles.videoModal}>
            <video
              ref={videoRef}
              className={styles.videoModal__player}
              src={selectedAgent.warningVideo}
              autoPlay
              controls={false}
              onEnded={handleBigBoyVideoEnd}
              playsInline
              preload="auto"
            />
          </div>
        </div>
      ) : null}

      {warningPhase === "recovery" ? (
        <div className={styles.recoveryOverlay} role="status" aria-live="polite">
          <div className={styles.recoveryOverlay__grid} aria-hidden="true" />
          <div className={styles.recoveryPanel}>
            <div className={styles.recoveryPanel__badge}>RECOVERY PROTOCOL</div>
            <div className={styles.recoveryPanel__title}>시스템 무결성 복구 중</div>
            <div className={styles.recoveryPanel__message}>
              시각 계층 오염 제거 완료.
              <br />
              격리 채널 종료 및 세션 권한 재동기화를 수행합니다.
            </div>
            <div className={styles.recoveryPanel__status}>
              <span>VISUAL STACK RESTORED</span>
              <span>TRACE SEALED</span>
              <span>ARCHIVE NODE STABLE</span>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
