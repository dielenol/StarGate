"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { IconCaution, IconRecovery, IconSecurity } from "@/components/icons";
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
        <div className={styles.notice__brand}>
          <Image
            src={resolvePublicAssetPath("/assets/StarGate_logo.webp")}
            alt=""
            width={42}
            height={42}
            priority
          />
          <div><strong>NOVUS ORDO</strong><span>정보보안 통제실</span></div>
        </div>
        <p className={styles.notice__classification}>SECURITY DIRECTIVE<span>긴급 통제 공지</span></p>
      </div>

      <article className={styles.notice__document}>
        <div className={styles.notice__alert}>
          <span><IconCaution aria-hidden />긴급 보안 통제 발령</span>
          <span className={styles.notice__alertCode}>EMERGENCY LOCKDOWN</span>
        </div>

        <header className={styles.notice__header}>
          <div className={styles.notice__intro}>
            <p className={styles.notice__eyebrow}>UNAUTHORIZED ACCESS DETECTED</p>
            <h1 id="maintenance-title">내부 업무망<span>긴급 봉쇄</span></h1>
            <p className={styles.notice__lead}>비인가 접근 징후가 감지되어<br />ERP의 모든 업무 기능을 즉시 중지했습니다.</p>
            <p className={styles.notice__description}>추가 침입과 기록 훼손을 방지하기 위해 접속 경로를 격리했습니다. 현재 기록 무결성 확인 및 접근 권한 재검증을 진행하고 있습니다.</p>
          </div>
          <div className={styles.notice__seal}>
            <span className={styles.notice__sealLabel}>RESTRICTED NETWORK</span>
            <div className={styles.notice__sealIcon} aria-hidden="true"><IconSecurity /></div>
            <strong>ACCESS DENIED</strong>
            <p>ERP 접근 전면 차단</p>
            <span className={styles.notice__sealCaption}>조회 · 기록 · 업무 처리 중지</span>
          </div>
        </header>

        <section className={styles.notice__response} aria-label="보안 대응 현황">
          <div className={styles.notice__responseItem}>
            <span className={styles.notice__step} aria-hidden="true">01</span>
            <div><span className={styles.notice__state}>차단 적용</span><h2>업무망 긴급 격리</h2></div>
            <span className={styles.notice__statusDot} aria-hidden="true" />
          </div>
          <div className={styles.notice__responseItem}>
            <span className={styles.notice__step} aria-hidden="true">02</span>
            <div><span className={styles.notice__state}>확인 중</span><h2>기록 무결성 검사</h2></div>
            <span className={styles.notice__statusDot} aria-hidden="true" />
          </div>
          <div className={styles.notice__responseItem}>
            <span className={styles.notice__step} aria-hidden="true">03</span>
            <div><span className={styles.notice__state}>재검증 중</span><h2>접근 권한 재검증</h2></div>
            <span className={styles.notice__statusDot} aria-hidden="true" />
          </div>
        </section>

        <div className={styles.notice__body}>
          <section className={styles.notice__scope} aria-labelledby="maintenance-scope">
            <h2 id="maintenance-scope" className={styles.notice__sectionTitle}>통제 범위 및 점검 일정</h2>
            <dl className={styles.notice__details}>
              <div><dt>차단 범위</dt><dd>ERP 전체 서비스<span className={styles.notice__tag}>접속 불가</span></dd></div>
              <div><dt>통제 시작</dt><dd><time dateTime={displayWindow.startsAt}>{KST_FORMATTER.format(new Date(displayWindow.startsAt))}</time><small>KST</small></dd></div>
              <div><dt>재개 예정</dt><dd><time dateTime={displayWindow.endsAt}>{KST_FORMATTER.format(new Date(displayWindow.endsAt))}</time><small>KST</small></dd></div>
            </dl>
          </section>
          <section className={styles.notice__recovery} aria-label="점검 종료까지 남은 시간">
            <div className={styles.notice__countdown}>
              <p><IconRecovery aria-hidden />업무망 자동 재개까지</p>
              <strong>{formatCountdown(remaining)}</strong>
              <span className={styles.notice__timeUnit} aria-hidden="true">HOURS : MINUTES : SECONDS</span>
            </div>
            <p className={styles.notice__resume}>점검 종료 시 업무망이 자동으로 재개됩니다.</p>
            <a className={styles.notice__retry} href="/erp">접속 상태 다시 확인<span aria-hidden="true">↗</span></a>
          </section>
        </div>

        <aside className={styles.notice__warning} aria-label="보안 유의사항">
          <IconCaution aria-hidden />
          <p><strong>비공식 복구 요청에 응하지 마십시오.</strong> 출처가 확인되지 않은 접속 링크와 인증 정보 요청은 즉시 무시하십시오.</p>
        </aside>
        <footer className={styles.notice__footer}>
          <p>NOVUS ORDO <span>정보보안 통제실</span></p>
          <p>업무망 격리 · 보안 점검 진행 중</p>
        </footer>
      </article>
      <Link className={styles.notice__archiveLink} href="/">공식 공개 아카이브로 이동<span aria-hidden="true">↗</span></Link>
    </main>
  );
}
