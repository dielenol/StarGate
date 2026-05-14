"use client";

import { useEffect } from "react";

import { useLinkStatus } from "next/link";

import { useNavPending } from "./NavPendingProvider";

/**
 * `<Link>` 자식으로 꽂으면 클릭 → navigation commit 까지의 pending 윈도우를
 * 전역 NavPending 카운터에 누적시킨다. 별도 마크업은 렌더하지 않는다.
 */
export default function LinkPendingProbe() {
  const { pending } = useLinkStatus();
  const { begin, end } = useNavPending();

  useEffect(() => {
    if (!pending) return;
    begin();
    return end;
  }, [pending, begin, end]);

  return null;
}
