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
  beginRouteLoading: () => void;
  endRouteLoading: () => void;
}

const NO_OP: NavPendingContextValue = {
  begin: () => {},
  end: () => {},
  beginRouteLoading: () => {},
  endRouteLoading: () => {},
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
  const [routeLoadingCount, setRouteLoadingCount] = useState(0);

  const begin = useCallback(() => setCount((c) => c + 1), []);
  const end = useCallback(() => setCount((c) => Math.max(0, c - 1)), []);
  const beginRouteLoading = useCallback(
    () => setRouteLoadingCount((c) => c + 1),
    [],
  );
  const endRouteLoading = useCallback(
    () => setRouteLoadingCount((c) => Math.max(0, c - 1)),
    [],
  );

  const value = useMemo(
    () => ({ begin, end, beginRouteLoading, endRouteLoading }),
    [begin, end, beginRouteLoading, endRouteLoading],
  );

  return (
    <NavPendingContext.Provider value={value}>
      {children}
      <NavPendingOverlay pending={count > 0 && routeLoadingCount === 0} />
    </NavPendingContext.Provider>
  );
}
