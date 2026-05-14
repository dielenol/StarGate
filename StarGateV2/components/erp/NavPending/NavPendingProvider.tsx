"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import NavPendingOverlay from "./NavPendingOverlay";

interface NavPendingContextValue {
  begin: () => void;
  end: () => void;
}

const NO_OP: NavPendingContextValue = {
  begin: () => {},
  end: () => {},
};

const NavPendingContext = createContext<NavPendingContextValue | null>(null);

export function useNavPending(): NavPendingContextValue {
  return useContext(NavPendingContext) ?? NO_OP;
}

export default function NavPendingProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [count, setCount] = useState(0);

  const begin = useCallback(() => setCount((c) => c + 1), []);
  const end = useCallback(() => setCount((c) => Math.max(0, c - 1)), []);

  const value = useMemo(() => ({ begin, end }), [begin, end]);

  return (
    <NavPendingContext.Provider value={value}>
      {children}
      <NavPendingOverlay pending={count > 0} />
    </NavPendingContext.Provider>
  );
}
