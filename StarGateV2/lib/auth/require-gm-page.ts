import "server-only";

import { notFound } from "next/navigation";

import { getActiveSession } from "@/lib/auth/active-session";

/** 운영 잠금이나 로컬 미리보기 설정과 무관하게 GM 전용 페이지를 보호한다. */
export async function requireGmPageSession() {
  const session = await getActiveSession();
  if (!session || session.user.isGuest || session.user.role !== "GM") {
    notFound();
  }
  return session;
}
