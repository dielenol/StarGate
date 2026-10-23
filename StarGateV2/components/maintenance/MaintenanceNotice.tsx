"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";

import { resolvePublicAssetPath } from "@/lib/asset-path";
import {
  RECOVERY_STAGES,
  formatKstClock,
  incidentCode,
  recoveryProgress,
  recoveryStageIndex,
} from "@/lib/maintenance/recovery";

import type { MaintenanceState } from "@/lib/maintenance/schedule";

import CorruptedEmblem from "./CorruptedEmblem";
import GlitchText from "./GlitchText";
import IncidentBulletin from "./IncidentBulletin";
import RecoveryLog from "./RecoveryLog";
import SectorMatrix from "./SectorMatrix";

import styles from "./MaintenanceNotice.module.css";

type MaintenanceNoticeProps = {
  startsAt: string;
  endsAt: string;
  serverNow: number;
  preview?: boolean;
};

const KST_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const METER_SEGMENTS = 40;
const TICKER_COPIES = [0, 1, 2, 3];
const STAGE_STATE_LABELS = { done: "완료", active: "진행 중", pending: "대기" } as const;

function formatCountdown(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((unit) => String(unit).padStart(2, "0"))
    .join(":");
}

export default function MaintenanceNotice({
  startsAt,
  endsAt,
  serverNow,
  preview = false,
}: MaintenanceNoticeProps) {
  const [remaining, setRemaining] = useState(() => Math.max(0, Date.parse(endsAt) - serverNow));
  const [displayWindow, setDisplayWindow] = useState({ startsAt, endsAt });

  useEffect(() => {
    let disposed = false;
    let navigating = false;
    let checking = false;
    let controller: AbortController | undefined;
    let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
    let referenceNow = serverNow;
    let endTime = Date.parse(endsAt);
    let origin = performance.now();
    let nextCheck = origin + 15_000;

    async function checkStatus() {
      if (disposed || navigating || checking || preview) return;
      checking = true;
      controller = new AbortController();
      timeoutTimer = setTimeout(() => controller?.abort(), 5_000);
      try {
        const response = await fetch("/api/maintenance", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("maintenance status unavailable");
        const status: MaintenanceState = await response.json();
        if (disposed) return;
        if (["off", "scheduled", "ended", "invalid"].includes(status.phase)) {
          navigating = true;
          window.location.replace("/erp");
          nextCheck = Number.POSITIVE_INFINITY;
          return;
        }
        const nextEnd = status.endsAt ? Date.parse(status.endsAt) : NaN;
        if (status.phase !== "active" || !status.startsAt || !status.endsAt || !Number.isFinite(status.serverNow) || !Number.isFinite(nextEnd)) {
          throw new Error("invalid maintenance status");
        }
        referenceNow = status.serverNow;
        endTime = nextEnd;
        origin = performance.now();
        setDisplayWindow({ startsAt: status.startsAt, endsAt: status.endsAt });
        setRemaining(Math.max(0, endTime - referenceNow));
        nextCheck = origin + 15_000;
      } catch {
        // 연결 실패나 응답 지연을 서비스 재개로 해석하지 않는다.
        nextCheck = performance.now() + 5_000;
      } finally {
        clearTimeout(timeoutTimer);
        checking = false;
      }
    }

    function tick() {
      if (disposed || navigating) return;
      const now = performance.now();
      const left = Math.max(0, endTime - referenceNow - (now - origin));
      setRemaining(left);
      if (now >= nextCheck) void checkStatus();
      else if (left === 0 && nextCheck > now + 5_000) {
        nextCheck = now;
        void checkStatus();
      }
    }
    // 절전 복귀 시 monotonic clock의 OS 차이에 의존하지 않고 서버를 확인한다.
    const onFocus = () => { void checkStatus(); };
    const onVisible = () => { if (document.visibilityState === "visible") void checkStatus(); };
    const timer = setInterval(tick, 1_000);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      clearInterval(timer);
      clearTimeout(timeoutTimer);
      controller?.abort();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [startsAt, endsAt, serverNow, preview]);

  // 복구율과 화면 손상도는 서버 기준 현재 시각에서 결정론적으로 계산한다.
  const now = Date.parse(displayWindow.endsAt) - remaining;
  const progress = recoveryProgress(displayWindow.startsAt, displayWindow.endsAt, now);
  const stageIndex = recoveryStageIndex(progress);
  const stage = RECOVERY_STAGES[stageIndex];
  const corruption = 1 - progress;
  const percent = Math.floor(progress * 1_000) / 10;
  const filledSegments = Math.floor(progress * METER_SEGMENTS);
  const incident = incidentCode(displayWindow.startsAt);
  const startedAt = KST_FORMATTER.format(new Date(displayWindow.startsAt));
  const resumesAt = KST_FORMATTER.format(new Date(displayWindow.endsAt));
  const atmosphere = {
    "--corruption": corruption.toFixed(3),
    "--emblem": `url("${resolvePublicAssetPath("/assets/StarGate_logo_watermark.webp")}")`,
  } as CSSProperties;

  return (
    <main
      className={[styles.notice, styles[`notice--${stage.code.toLowerCase()}`]].filter(Boolean).join(" ")}
      style={atmosphere}
      aria-labelledby="maintenance-title"
    >
      <div className={styles.notice__fx} aria-hidden="true" />
      <div className={styles.notice__screen}>
        <div className={styles.notice__frame}>
          <header className={styles.notice__masthead}>
            <div className={styles.notice__brand}>
              <CorruptedEmblem className={styles.notice__logo} />
              <div><strong>NOVUS ORDO</strong><span className={styles.notice__brandSub}>보안관제센터 · 사고 대응</span></div>
            </div>
            <p className={styles.notice__live}>
              <span className={styles.notice__liveBadge}><i aria-hidden="true" />LIVE</span>
              <span className={styles.notice__incident}>{incident}</span>
              <span className={styles.notice__threat}>SEV-1 · CRITICAL</span>
            </p>
          </header>

          <div className={styles.notice__ticker} aria-hidden="true">
            <div className={styles.notice__tickerTrack}>
              {TICKER_COPIES.map((copy) => (
                <span key={copy}>
                  {stage.ticker.map((item) => <span key={item}>{item}</span>)}
                </span>
              ))}
            </div>
          </div>

          <section className={styles.notice__hero}>
            <CorruptedEmblem className={styles.notice__watermark} />
            <div>
              <p className={styles.notice__eyebrow}>
                <i aria-hidden="true" />SYSTEM BREACH DETECTED · {formatKstClock(Date.parse(displayWindow.startsAt))} KST
              </p>
              <h1 id="maintenance-title" className={styles.notice__title}>
                <span className={styles.notice__srOnly}>내부망 침해, 복구 진행 중</span>
                <GlitchText text="내부망 침해" intensity={corruption} className={styles.notice__titleBreach} />
                <span className={styles.notice__titleRecover} aria-hidden="true">
                  복구 진행 중<i className={styles.notice__cursor} />
                </span>
              </h1>
              <p className={styles.notice__lead}>
                {startedAt}, 내부 업무망(ERP)에서 <strong>탈취된 관리자 계정</strong>을 이용한 비인가 접근이 확인되었습니다.
                보안관제센터는 즉시 전 구역을 격리하고 복구 절차에 착수했습니다.
              </p>
              <dl className={styles.notice__facts}>
                <div><dt>최초 탐지</dt><dd><time dateTime={displayWindow.startsAt}>{startedAt}</time></dd></div>
                <div><dt>침입 경로</dt><dd className={styles.notice__pending}>분석 중</dd></div>
                <div><dt>피해 범위</dt><dd>ERP 전 구역</dd></div>
                <div><dt>재개 예정</dt><dd><time dateTime={displayWindow.endsAt}>{resumesAt}</time></dd></div>
              </dl>
            </div>

            <section className={styles.notice__status} aria-labelledby="recovery-status-title">
              <div className={styles.notice__statusHead}>
                <h2 id="recovery-status-title">RECOVERY STATUS</h2>
                <span>STAGE {String(stageIndex + 1).padStart(2, "0")} / {String(RECOVERY_STAGES.length).padStart(2, "0")}</span>
              </div>
              <div className={styles.notice__statusBody}>
                <div>
                  <p className={styles.notice__percent}>
                    <strong>{percent.toFixed(1).padStart(4, "0")}<small>%</small></strong>
                    <span>전체 복구율 · {stage.label}</span>
                  </p>
                  <div
                    className={styles.notice__meter}
                    role="progressbar"
                    aria-label="전체 복구율"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={percent}
                  >
                    {Array.from({ length: METER_SEGMENTS }, (_, index) => {
                      const state = index < filledSegments ? "filled" : index === filledSegments ? "active" : "empty";
                      return <i key={index} className={styles[`notice__meterCell--${state}`]} />;
                    })}
                  </div>
                  <ol className={styles.notice__stages}>
                    {RECOVERY_STAGES.map((item, index) => {
                      const state = index < stageIndex ? "done" : index === stageIndex ? "active" : "pending";
                      return (
                        <li key={item.code} className={[styles.notice__stage, styles[`notice__stage--${state}`]].filter(Boolean).join(" ")}>
                          <span>{String(index + 1).padStart(2, "0")}</span>{" "}
                          {item.label}{" "}
                          <em>{STAGE_STATE_LABELS[state]}</em>
                        </li>
                      );
                    })}
                  </ol>
                </div>
                <div>
                  <div className={styles.notice__countdown}>
                    <p>업무망 자동 재개까지</p>
                    <strong>{formatCountdown(remaining)}</strong>
                    <span aria-hidden="true">HOURS : MINUTES : SECONDS</span>
                  </div>
                  <a className={styles.notice__retry} href="/erp">접속 상태 다시 확인<span aria-hidden="true">↗</span></a>
                </div>
              </div>
            </section>
          </section>

          <div className={styles.notice__ops}>
            <SectorMatrix progress={progress} />
            <RecoveryLog startsAt={displayWindow.startsAt} endsAt={displayWindow.endsAt} now={now} />
          </div>

          <div className={styles.notice__section}>
            <IncidentBulletin startsAt={displayWindow.startsAt} endsAt={displayWindow.endsAt} now={now} />
          </div>

          <footer className={styles.notice__footer}>
            <div className={styles.notice__footerMeta}>
              <p>NOVUS ORDO 보안관제센터<span>{incident} · 대응 종료 시 업무망 자동 재개</span></p>
              <Link className={styles.notice__archiveLink} href="/">공식 공개 아카이브로 이동<span aria-hidden="true">↗</span></Link>
            </div>
          </footer>
        </div>
      </div>
      {preview && (
        <p className={styles.notice__preview}>
          PREVIEW · 시작 +{Math.floor((now - Date.parse(displayWindow.startsAt)) / 60_000)}분
        </p>
      )}
    </main>
  );
}
