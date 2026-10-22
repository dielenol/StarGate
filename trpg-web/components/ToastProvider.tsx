"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

import {
  createPausableCountdown,
  type PausableCountdown,
} from "@/lib/toast/pausable-countdown";

import styles from "./ToastProvider.module.css";

export type ToastTone = "success" | "error";

export interface ShowToastOptions {
  /** 기본 success. error 는 라벨 "실패" 와 danger 색으로 표시하고 role="alert" 로 바로 읽어 준다. */
  tone?: ToastTone;
}

interface ToastItem {
  id: string;
  message: string;
  tone: ToastTone;
  closing: boolean;
  /** 자동 닫기가 멈춰 있는가 — 진행 띠를 같은 상태에서 멈추는 .toast--paused 의 근거. */
  paused: boolean;
}

interface ToastContextValue {
  showToast: (message: string, options?: ShowToastOptions) => void;
}

/**
 * 자동 닫기를 멈추는 이유. 겹칠 수 있어 마지막 것이 풀릴 때 재개한다(PausableCountdown).
 * hover — 마우스 포인터가 올라와 있는 동안, focus — 닫기 버튼 등 안쪽에 포커스가 있는 동안,
 * pinned — 터치·펜 기기에서 본문을 탭해 고정한 동안(다시 탭하면 해제. 펜 hover 는 기기마다 달라 쓰지 않는다).
 */
type PauseReason = "hover" | "focus" | "pinned";

const ToastContext = createContext<ToastContextValue | null>(null);
/**
 * 톤별 노출 시간 — 실패는 읽고 대처할 시간을 더 준다. JS 자동 닫기 타이머와 CSS 진행 띠·퇴장
 * 애니메이션 길이의 단일 출처로, 토스트 요소에 `--toast-visible-duration`·`--toast-exit-duration`
 * CSS 변수로 내려준다(CSS 쪽에 숫자를 따로 적지 않는다).
 */
const TOAST_VISIBLE_MS: Record<ToastTone, number> = {
  success: 3000,
  error: 8000,
};
const TOAST_EXIT_MS = 220;
const TOAST_LABELS: Record<ToastTone, string> = {
  success: "완료",
  error: "실패",
};

/** 터치는 hover 가 없고 펜은 hover 를 믿을 수 없어, 올려두기 대신 탭으로 고정을 토글한다. */
function isHoverlessPointer(pointerType: string) {
  return pointerType === "touch" || pointerType === "pen";
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  /** 토스트별 자동 닫기 카운트다운. 커밋된 `toasts` 를 기준으로 아래 effect 가 만들고 정리한다. */
  const [countdowns] = useState(() => new Map<string, PausableCountdown>());
  const exitTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const dismissToast = useCallback(
    (id: string) => {
      // 닫기 버튼으로 먼저 닫히면 멈춰 있던 자동 닫기도 함께 끝낸다(자동 닫기 자체가 부른 경우는 이미 settled).
      countdowns.get(id)?.cancel();
      setToasts((current) =>
        current.map((toast) =>
          toast.id === id ? { ...toast, closing: true } : toast,
        ),
      );

      const timer = setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
      }, TOAST_EXIT_MS);
      exitTimersRef.current.push(timer);
    },
    [countdowns],
  );

  /** 상태만 바꾼다 — 카운트다운은 이 토스트가 커밋된 뒤 아래 effect 가 만든다. */
  const showToast = useCallback(
    (message: string, options?: ShowToastOptions) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const tone = options?.tone ?? "success";
      setToasts((current) =>
        [
          ...current,
          { id, message, tone, closing: false, paused: false },
        ].slice(-3),
      );
    },
    [],
  );

  /** 카운트다운을 바꾼 뒤 `paused` 를 상태에 비춘다 — 달라졌을 때만 새 배열을 만들어 불필요한 렌더를 피한다. */
  const updateCountdown = useCallback(
    (id: string, update: (countdown: PausableCountdown) => void) => {
      const countdown = countdowns.get(id);
      if (!countdown) return;
      update(countdown);
      const paused = countdown.paused;
      setToasts((current) =>
        current.some((toast) => toast.id === id && toast.paused !== paused)
          ? current.map((toast) =>
              toast.id === id ? { ...toast, paused } : toast,
            )
          : current,
      );
    },
    [countdowns],
  );

  const holdToast = useCallback(
    (id: string, reason: PauseReason) => {
      updateCountdown(id, (countdown) => countdown.hold(reason));
    },
    [updateCountdown],
  );

  const releaseToast = useCallback(
    (id: string, reason: PauseReason) => {
      updateCountdown(id, (countdown) => countdown.release(reason));
    },
    [updateCountdown],
  );

  const togglePinnedToast = useCallback(
    (id: string) => {
      updateCountdown(id, (countdown) => {
        if (countdown.isHeld("pinned")) countdown.release("pinned");
        else countdown.hold("pinned");
      });
    },
    [updateCountdown],
  );

  // 커밋된 `toasts` 와 카운트다운 맵을 맞춘다 — 표시 중(closing 아님)인 토스트는 카운트다운이 있고, 그 밖의
  // 것(퇴장 중·퇴장 완료·3개 초과로 밀림)은 없다. 생성을 showToast 가 아니라 여기서 하는 이유: setToasts 가
  // 커밋되기 전에 다른 토스트의 hover·포커스가 updateCountdown → setToasts 로 먼저 커밋되면, 그 커밋의 toasts 에
  // 없는 새 토스트의 카운트다운을 정리가 지워 버려 자동 닫기·hover 가 모두 죽는다. 같은 effect 가 커밋 기준으로
  // 둘 다 맡으면 순서와 무관하고, dev Fast Refresh 로 언마운트 cleanup 이 맵을 비워도 다음 실행이 다시 만든다
  // (남은 시간·hold 는 처음으로 돌아간다).
  useEffect(() => {
    const shown = new Set<string>();
    for (const toast of toasts) {
      if (toast.closing) continue;
      shown.add(toast.id);
      if (countdowns.has(toast.id)) continue;
      countdowns.set(
        toast.id,
        createPausableCountdown(TOAST_VISIBLE_MS[toast.tone], () =>
          dismissToast(toast.id),
        ),
      );
    }
    for (const [id, countdown] of countdowns) {
      if (shown.has(id)) continue;
      countdown.cancel();
      countdowns.delete(id);
    }
  }, [toasts, countdowns, dismissToast]);

  useEffect(() => {
    const exitTimers = exitTimersRef.current;
    return () => {
      for (const timer of exitTimers) clearTimeout(timer);
      for (const countdown of countdowns.values()) countdown.cancel();
      countdowns.clear();
    };
  }, [countdowns]);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className={styles.toastViewport}
        role="region"
        aria-label="작업 결과 알림"
      >
        {toasts.map((toast) => (
          <ToastCard
            toast={toast}
            onDismiss={dismissToast}
            onHold={holdToast}
            onRelease={releaseToast}
            onTogglePinned={togglePinnedToast}
            key={toast.id}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

interface ToastCardProps {
  toast: ToastItem;
  onDismiss: (id: string) => void;
  onHold: (id: string, reason: PauseReason) => void;
  onRelease: (id: string, reason: PauseReason) => void;
  onTogglePinned: (id: string) => void;
}

/**
 * 토스트 한 장. 자동 닫기를 멈추는 상호작용(hover·포커스·탭 고정)을 여기서 받아 Provider 에 알린다.
 * 멈춤 상태는 .toast--paused 로 진행 띠에 그대로 비친다(JS 타이머와 같은 상태, 같은 시점).
 */
function ToastCard({
  toast,
  onDismiss,
  onHold,
  onRelease,
  onTogglePinned,
}: ToastCardProps) {
  /** click 이벤트에는 pointerType 이 없어 직전 pointerdown 의 종류로 터치 탭인지 가린다. */
  const lastPointerTypeRef = useRef("mouse");
  const isError = toast.tone === "error";
  const durationStyle = {
    "--toast-visible-duration": `${TOAST_VISIBLE_MS[toast.tone]}ms`,
    "--toast-exit-duration": `${TOAST_EXIT_MS}ms`,
  } as CSSProperties;

  const handlePointerEnter = (event: PointerEvent<HTMLDivElement>) => {
    if (!isHoverlessPointer(event.pointerType)) onHold(toast.id, "hover");
  };

  const handlePointerLeave = (event: PointerEvent<HTMLDivElement>) => {
    if (!isHoverlessPointer(event.pointerType)) onRelease(toast.id, "hover");
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    lastPointerTypeRef.current = event.pointerType;
  };

  const handleFocus = () => {
    onHold(toast.id, "focus");
  };

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    // 토스트 안에서 포커스가 옮겨 다니는 동안은 계속 멈춘 상태로 둔다.
    if (event.currentTarget.contains(event.relatedTarget)) return;
    onRelease(toast.id, "focus");
  };

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    // 닫기 버튼처럼 제 역할이 있는 컨트롤의 클릭은 고정 토글이 아니다.
    if (!(event.target instanceof Element) || event.target.closest("button, a"))
      return;
    if (!isHoverlessPointer(lastPointerTypeRef.current)) return;
    onTogglePinned(toast.id);
  };

  return (
    <div
      className={[
        styles.toast,
        isError ? styles["toast--error"] : "",
        toast.paused ? styles["toast--paused"] : "",
        toast.closing ? styles["toast--closing"] : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={durationStyle}
      // 실패는 몇 초 뒤 스스로 사라지는 중요한 알림이라 polite(status) 대신 assertive(alert) 로 바로 읽어 준다.
      role={isError ? "alert" : "status"}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onPointerDown={handlePointerDown}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onClick={handleClick}
    >
      <div className={styles.toast__body}>
        <span className={styles.toast__label}>{TOAST_LABELS[toast.tone]}</span>
        <p className={styles.toast__message}>{toast.message}</p>
      </div>
      <button
        className={styles.toast__close}
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="알림 닫기"
      >
        ×
      </button>
    </div>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}
