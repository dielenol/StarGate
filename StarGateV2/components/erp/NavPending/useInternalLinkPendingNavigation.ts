"use client";

import { useCallback, useEffect, useTransition } from "react";

import { useRouter } from "next/navigation";

import { useNavPending } from "./NavPendingProvider";

function isPlainPrimaryClick(event: React.MouseEvent<HTMLElement>): boolean {
  return (
    event.button === 0 &&
    !event.defaultPrevented &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

export function useInternalLinkPendingNavigation() {
  const router = useRouter();
  const { begin, end } = useNavPending();
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!isPending) return;
    begin();
    return end;
  }, [isPending, begin, end]);

  return useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (!isPlainPrimaryClick(event)) return;
      if (!(event.target instanceof Element)) return;

      const anchor = event.target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (!event.currentTarget.contains(anchor)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const rawHref = anchor.getAttribute("href");
      if (!rawHref || rawHref.startsWith("#")) return;

      const url = new URL(anchor.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname !== "/erp" && !url.pathname.startsWith("/erp/")) return;

      const nextHref = `${url.pathname}${url.search}${url.hash}`;
      const currentHref = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (nextHref === currentHref) return;

      event.preventDefault();
      startTransition(() => {
        router.push(nextHref);
      });
    },
    [router, startTransition],
  );
}
