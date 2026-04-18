/**
 * Next.js Instrumentation hook
 *
 * 서버 시작 시 1회 실행되어 MongoDB 인덱스를 보장합니다.
 * 참고: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 */

export async function register() {
  // Edge Runtime에서는 mongodb 사용 불가 → Node 런타임에서만 실행
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { ensureAllIndexes } = await import("@stargate/shared-db");
  await import("./lib/db/init");

  try {
    await ensureAllIndexes();
    console.log("[instrumentation] ensureAllIndexes 완료");
  } catch (err) {
    console.error("[instrumentation] ensureAllIndexes 실패:", err);
  }
}
