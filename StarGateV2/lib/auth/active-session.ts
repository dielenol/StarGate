import "server-only";

import { cache } from "react";

import type { Session } from "next-auth";

import { auth } from "@/lib/auth/config";

export type ActiveSession = Session & { user: Session["user"] };

/**
 * auth()가 DB의 최신 role/status를 검증한다. React cache는 같은 RSC 요청의
 * layout/page 중복 auth/DB 조회만 제거한다.
 */
const loadActiveSession = cache(async (): Promise<ActiveSession | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;

  return session as ActiveSession;
});

export async function getActiveSession(): Promise<ActiveSession | null> {
  return loadActiveSession();
}
