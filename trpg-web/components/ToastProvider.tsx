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

interface ToastItem {
  id: string;
  message: string;
  closing: boolean;
}

interface ToastContextValue {
  showToast: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);
const TOAST_VISIBLE_MS = 3000;
const TOAST_EXIT_MS = 220;

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
    (message: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setToasts((current) =>
        [...current, { id, message, closing: false }].slice(-3),
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
        {toasts.map((toast) => (
          <div
            className={`${styles.toast} ${
              toast.closing ? styles["toast--closing"] : ""
            }`}
            role="status"
            key={toast.id}
          >
            <div className={styles.toast__body}>
              <span className={styles.toast__label}>완료</span>
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
        ))}
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
