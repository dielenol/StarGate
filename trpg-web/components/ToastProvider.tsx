"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

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
}

interface ToastContextValue {
  showToast: (message: string, options?: ShowToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);
const TOAST_VISIBLE_MS = 3000;
const TOAST_EXIT_MS = 220;
const TOAST_LABELS: Record<ToastTone, string> = {
  success: "완료",
  error: "실패",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) =>
      current.map((toast) =>
        toast.id === id ? { ...toast, closing: true } : toast,
      ),
    );

    const timer = setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, TOAST_EXIT_MS);
    timersRef.current.push(timer);
  }, []);

  const showToast = useCallback(
    (message: string, options?: ShowToastOptions) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const tone = options?.tone ?? "success";
      setToasts((current) =>
        [...current, { id, message, tone, closing: false }].slice(-3),
      );

      const timer = setTimeout(() => {
        dismissToast(id);
      }, TOAST_VISIBLE_MS);
      timersRef.current.push(timer);
    },
    [dismissToast],
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className={styles.toastViewport}
        role="region"
        aria-label="작업 결과 알림"
      >
        {toasts.map((toast) => {
          const isError = toast.tone === "error";
          return (
            <div
              className={[
                styles.toast,
                isError ? styles["toast--error"] : "",
                toast.closing ? styles["toast--closing"] : "",
              ]
                .filter(Boolean)
                .join(" ")}
              // 실패는 3초 뒤 사라지는 중요한 알림이라 polite(status) 대신 assertive(alert) 로 바로 읽어 준다.
              role={isError ? "alert" : "status"}
              key={toast.id}
            >
              <div className={styles.toast__body}>
                <span className={styles.toast__label}>
                  {TOAST_LABELS[toast.tone]}
                </span>
                <p className={styles.toast__message}>{toast.message}</p>
              </div>
              <button
                className={styles.toast__close}
                type="button"
                onClick={() => dismissToast(toast.id)}
                aria-label="알림 닫기"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}
