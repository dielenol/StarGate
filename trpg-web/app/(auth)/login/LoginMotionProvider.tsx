"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface LoginMotionContextValue {
  paused: boolean;
  togglePaused: () => void;
}

const LoginMotionContext = createContext<LoginMotionContextValue | null>(null);

/** 로고 모션과 배경 모션이 같은 일시정지 상태를 공유하도록 묶는다. */
export function LoginMotionProvider({ children }: { children: ReactNode }) {
  const [paused, setPaused] = useState(false);

  const togglePaused = useCallback(() => {
    setPaused((current) => !current);
  }, []);

  const value = useMemo(() => ({ paused, togglePaused }), [paused, togglePaused]);

  return (
    <LoginMotionContext.Provider value={value}>
      {children}
    </LoginMotionContext.Provider>
  );
}

export function useLoginMotion(): LoginMotionContextValue {
  const context = useContext(LoginMotionContext);
  if (!context) {
    throw new Error("useLoginMotion은 LoginMotionProvider 안에서만 사용할 수 있습니다.");
  }
  return context;
}
