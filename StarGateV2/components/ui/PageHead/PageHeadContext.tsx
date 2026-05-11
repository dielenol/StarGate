"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import type { ReactNode } from "react";

import type { BreadcrumbItem } from "./Breadcrumb";

interface PageHeadState {
  breadcrumb?: ReactNode | BreadcrumbItem[];
  title?: ReactNode;
}

interface PageHeadContextValue extends PageHeadState {
  setPageHead: (next: PageHeadState) => void;
  clearPageHead: (token: number) => void;
  acquireToken: () => number;
}

const PageHeadContext = createContext<PageHeadContextValue | null>(null);

interface PageHeadProviderProps {
  children: ReactNode;
}

/**
 * ERP topbar 가운데 슬롯에 노출할 breadcrumb + title 을 보관하는 context.
 *
 * 동작 모델:
 *  - 각 페이지의 PageHead 컴포넌트(useSetPageHead) 가 마운트되면 자기 token 을
 *    획득하고 매 렌더마다 자기 데이터를 push.
 *  - Provider 의 setPageHead 는 동일 참조 비교로 noop 을 거른다. 동적 ReactNode
 *    title 도 매 렌더 새 참조라 commit 되긴 하지만 ERPHeader 만 re-render 되므로
 *    호출처(SessionsClient 등) 는 영향받지 않는다.
 *    (PageHeadProvider 가 받은 children prop 은 layout 에서 만들어진 안정 참조이므로
 *     Provider 의 setState 가 자식 트리 전체를 재렌더하지 않는다.)
 *  - unmount 시 자기 token 이 아직 활성이면 clear. 다른 페이지가 이미 push 했으면
 *    그 페이지 데이터를 침해하지 않는다.
 */
export function PageHeadProvider({ children }: PageHeadProviderProps) {
  const [state, setState] = useState<PageHeadState>({});
  const activeTokenRef = useRef<number>(0);
  const tokenSeqRef = useRef<number>(0);

  const acquireToken = useCallback(() => {
    tokenSeqRef.current += 1;
    const next = tokenSeqRef.current;
    activeTokenRef.current = next;
    return next;
  }, []);

  const setPageHead = useCallback((next: PageHeadState) => {
    setState((prev) => {
      if (
        prev.breadcrumb === next.breadcrumb &&
        prev.title === next.title
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  const clearPageHead = useCallback((token: number) => {
    if (activeTokenRef.current !== token) return;
    setState((prev) => {
      if (prev.breadcrumb == null && prev.title == null) return prev;
      return {};
    });
  }, []);

  /* state 변경마다 새 객체 — ctx 구독자 통지 목적. setPageHead 의 noop guard 가
     불필요한 commit 을 흡수하므로 caching 효과 0 인 useMemo 는 두지 않는다. */
  const value: PageHeadContextValue = {
    ...state,
    setPageHead,
    clearPageHead,
    acquireToken,
  };

  return (
    <PageHeadContext.Provider value={value}>
      {children}
    </PageHeadContext.Provider>
  );
}

export function usePageHead(): PageHeadState {
  const ctx = useContext(PageHeadContext);
  if (!ctx) return {};
  return { breadcrumb: ctx.breadcrumb, title: ctx.title };
}

/**
 * PageHead 컴포넌트가 자기 데이터를 context 에 push 한다.
 * - 마운트 시 token 획득, 자기 차례인 동안 매 렌더마다 push.
 * - unmount 시 자기 token 이 아직 활성이면 clear.
 * - 동적 ReactNode (예: SessionsClient 의 카운트 포함 title) 도 매 렌더 갱신됨.
 *   Provider 의 setPageHead 는 참조 비교 noop 으로 동일 값 commit 을 방지.
 *   동적 노드는 매 렌더 새 참조라 noop 되지 않고 ERPHeader 만 추가 렌더되지만
 *   호출처 트리는 영향받지 않음.
 */
export function useSetPageHead(input: PageHeadState) {
  const ctx = useContext(PageHeadContext);
  const tokenRef = useRef<number | null>(null);

  // 마운트 시 token 획득 + unmount 시 clear. 본 effect 는 deps 비어 있어
  // 마운트/언마운트 1회씩만 동작한다.
  useEffect(() => {
    if (!ctx) return;
    tokenRef.current = ctx.acquireToken();
    return () => {
      if (tokenRef.current != null) {
        ctx.clearPageHead(tokenRef.current);
        tokenRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // breadcrumb / title 참조가 바뀔 때만 push. 호출처가 동적 ReactNode 를
  // 새 참조로 만들면 매번 발화하지만, Provider 의 noop guard 가 동일 commit 을
  // 흡수한다. ctx 자체는 PageHeadProvider 마운트 후 동일 참조이므로 deps 에
  // 두어도 push 폭증을 일으키지 않는다.
  useEffect(() => {
    if (!ctx) return;
    ctx.setPageHead({
      breadcrumb: input.breadcrumb,
      title: input.title,
    });
  }, [ctx, input.breadcrumb, input.title]);
}
