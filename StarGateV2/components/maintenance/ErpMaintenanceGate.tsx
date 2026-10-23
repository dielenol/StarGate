"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { MaintenanceState } from "@/lib/maintenance/schedule";

/** 열린 업무 탭도 예약 시각에 닫는다. 요청의 최종 차단은 서버 proxy가 담당한다. */
export default function ErpMaintenanceGate({ initialState, children }: {
  initialState: MaintenanceState;
  children: ReactNode;
}) {
  const [blocked, setBlocked] = useState(initialState.phase === "active");

  useEffect(() => {
    let disposed = false;
    let navigating = false;
    let controller: AbortController | undefined;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let boundaryTimer: ReturnType<typeof setTimeout> | undefined;
    let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;

    function block() {
      if (disposed || navigating) return;
      navigating = true;
      setBlocked(true);
      window.location.replace("/maintenance");
    }

    function apply(state: MaintenanceState) {
      clearTimeout(boundaryTimer);
      if (state.phase === "active") {
        block();
      } else if (state.phase === "scheduled" && state.startsAt) {
        const delay = Date.parse(state.startsAt) - state.serverNow;
        // 먼 예약은 정기 재확인에 맡겨 32bit 타이머 범위 초과를 피한다.
        if (delay <= 2_147_483_647) boundaryTimer = setTimeout(block, Math.max(0, delay));
      }
    }

    async function refresh() {
      if (disposed || navigating || inFlight) return;
      inFlight = true;
      clearTimeout(refreshTimer);
      controller = new AbortController();
      timeoutTimer = setTimeout(() => controller?.abort(), 5_000);
      try {
        const response = await fetch("/api/maintenance", { cache: "no-store", signal: controller.signal });
        if (response.ok) {
          const state: MaintenanceState = await response.json();
          if (!disposed) apply(state);
        }
      } catch {
        // 조회 실패는 차단 해제가 아니다. 기존 예약 타이머를 보존한다.
      } finally {
        clearTimeout(timeoutTimer);
        inFlight = false;
        if (!disposed && !navigating) refreshTimer = setTimeout(refresh, 15_000);
      }
    }

    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    apply(initialState);
    void refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      controller?.abort();
      clearTimeout(refreshTimer);
      clearTimeout(boundaryTimer);
      clearTimeout(timeoutTimer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [initialState]);

  return blocked ? <p role="status">긴급 보안 점검 안내로 이동 중입니다.</p> : children;
}
