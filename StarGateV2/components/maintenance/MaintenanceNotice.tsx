"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { IconCaution, IconRecovery } from "@/components/icons";
import { resolvePublicAssetPath } from "@/lib/asset-path";

import type { MaintenanceState } from "@/lib/maintenance/schedule";

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

  return (
    <main className={styles.notice} aria-labelledby="maintenance-title">
      <div className={styles.notice__masthead}>
        <Image
          src={resolvePublicAssetPath("/assets/StarGate_logo.webp")}
          alt=""
          width={42}
          height={42}
          priority
        />
        <span>NOVUS ORDO</span>
      </div>

      <article className={styles.notice__document}>
        <header className={styles.notice__header}>
          <p className={styles.notice__eyebrow}>SYSTEM SECURITY NOTICE</p>
          <span className={styles.notice__badge}>
            <IconCaution aria-hidden />
            긴급 점검
          </span>
          <h1 id="maintenance-title">ERP 긴급 보안 점검 안내</h1>
          <p className={styles.notice__suspension}>TEMPORARY SUSPENSION</p>
        </header>

        <div className={styles.notice__rule} aria-hidden />

        <div className={styles.notice__body}>
          <p className={styles.notice__lead}>
            비인가 접근 징후가 확인되어 내부 업무망을 일시 차단했습니다.
            <br />
            기록 무결성 확인과 접근 권한 재검증을 진행하고 있습니다.
          </p>

          <dl className={styles.notice__details}>
            <div>
              <dt>점검 일정</dt>
              <dd>
                <time dateTime={displayWindow.startsAt}>{KST_FORMATTER.format(new Date(displayWindow.startsAt))}</time>
                <span aria-hidden> — </span>
                <time dateTime={displayWindow.endsAt}>{KST_FORMATTER.format(new Date(displayWindow.endsAt))}</time>
                <small>KST</small>
              </dd>
            </div>
            <div>
              <dt>대상 범위</dt>
              <dd>ERP 전체 서비스</dd>
            </div>
            <div>
              <dt>진행 업무</dt>
              <dd>기록 무결성 검사 · 접근 경로 재검증</dd>
            </div>
          </dl>

          <section className={styles.notice__countdown} aria-label="점검 종료까지 남은 시간">
            <IconRecovery aria-hidden />
            <div>
              <p>점검 종료까지</p>
              <strong>{formatCountdown(remaining)}</strong>
            </div>
          </section>

          <p className={styles.notice__resume}>
            점검 종료 시 업무망이 자동으로 재개됩니다.
          </p>
          <a className={styles.notice__retry} href="/erp">
            접속 다시 확인
          </a>
        </div>

        <footer className={styles.notice__footer}>
          <p>NOVUS ORDO · 정보보안 통제실</p>
          <p>점검 중 출처가 확인되지 않은 복구 안내나 접속 요청에 응하지 마십시오.</p>
        </footer>
      </article>

      <Link href="/" className={styles.notice__archiveLink}>
        공식 공개 아카이브로 이동
      </Link>
    </main>
  );
}
