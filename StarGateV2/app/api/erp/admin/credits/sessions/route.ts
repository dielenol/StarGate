/**
 * GM 크레딧 운영 대시보드 — 세션 자동 보상 (eligibility + 발급).
 *
 * GET — 최근 daysBack(default 14, max 60) 일 이내 CLOSED 세션의 YES 응답자 후보 목록.
 *   query: daysBack
 *   응답: { candidates: SessionRewardCandidate[] }
 *   각 응답자는 status 라벨링 (eligible / no-user / no-character / integrity-violation / already-rewarded).
 *
 * POST — 선택 세션의 YES 응답자에 일괄 자동 보상.
 *   body: { sessionId, amount(>0), description? }
 *   응답: BulkGrantResult { results, succeeded, failed, skipped }
 *   - already-rewarded 는 skipped 로 분류.
 *
 * 응답 코드: 401 / 403 / 400 (입력 검증 실패) / 404 (세션 부재) / 500.
 * Cache: no-store.
 *
 * `enrichSessions()` 사용 X — MAIN AGENT 필터가 부재해 자동 보상 정합성 보장 불가.
 */

import { NextResponse } from "next/server";

import type {
  BulkGrantResult,
  BulkGrantResultItem,
  SessionRespondent,
  SessionRespondentStatus,
} from "@/types/credit-admin";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import { addCredit } from "@/lib/db/credits";
import {
  findSessionById,
  listRecentCompletedSessions,
} from "@/lib/db/sessions";
import { isValidObjectId } from "@/lib/db/utils";

import { buildSessionRewardCandidates } from "@/app/(erp)/erp/admin/credits/_session-rewards";

const DEFAULT_DAYS_BACK = 14;
const MAX_DAYS_BACK = 60;

/**
 * status → response.code 명시 매핑.
 * `status.toUpperCase().replace(/-/g, "_")` 같은 임시 변환은 새 status 추가 시 패턴 깨짐.
 */
const STATUS_TO_CODE: Record<SessionRespondentStatus, string> = {
  eligible: "ELIGIBLE",
  "no-user": "NO_USER",
  "no-character": "NO_CHARACTER",
  "integrity-violation": "INTEGRITY_VIOLATION",
  "already-rewarded": "ALREADY_REWARDED",
};

/* ────────────────────────────────────────────────────────────── *
 * GET — eligibility 후보 조회
 * ────────────────────────────────────────────────────────────── */

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requireRole(session.user.role, "GM");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const guildId = process.env.GUILD_ID;
  if (!guildId) {
    return NextResponse.json(
      { error: "GUILD_ID 환경변수가 설정되지 않았습니다." },
      { status: 500 },
    );
  }

  const url = new URL(request.url);
  const daysBackParam = url.searchParams.get("daysBack");
  let daysBack = DEFAULT_DAYS_BACK;
  if (daysBackParam !== null) {
    const n = Number(daysBackParam);
    if (!Number.isFinite(n) || n < 1) {
      return NextResponse.json(
        { error: "daysBack은 1 이상의 숫자여야 합니다." },
        { status: 400 },
      );
    }
    daysBack = Math.min(Math.floor(n), MAX_DAYS_BACK);
  }

  try {
    const sessions = await listRecentCompletedSessions(daysBack, guildId);
    if (sessions.length === 0) {
      return NextResponse.json(
        { candidates: [] },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const candidates = await buildSessionRewardCandidates(sessions);

    return NextResponse.json(
      { candidates },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "세션 후보 조회 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/* ────────────────────────────────────────────────────────────── *
 * POST — 선택 세션 일괄 자동 보상
 * ────────────────────────────────────────────────────────────── */

interface PostBody {
  sessionId?: string;
  amount?: number;
  description?: string;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requireRole(session.user.role, "GM");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as PostBody;

  if (!body.sessionId || !isValidObjectId(body.sessionId)) {
    return NextResponse.json(
      { error: "sessionId가 올바른 ObjectId 형식이 아닙니다." },
      { status: 400 },
    );
  }

  if (
    typeof body.amount !== "number" ||
    !Number.isFinite(body.amount) ||
    body.amount <= 0
  ) {
    return NextResponse.json(
      { error: "amount는 0보다 큰 유한 숫자여야 합니다 (자동 보상은 발급만)." },
      { status: 400 },
    );
  }
  const amount = body.amount;

  // description 은 audit 가치 보존을 위해 비어있지 않은 string 강제.
  // UI 는 default 로 "세션 자동 보상 — {sessionTitle}" 채움 → 정상 흐름 차단 X.
  if (typeof body.description !== "string" || body.description.trim().length === 0) {
    return NextResponse.json(
      { error: "description은 비어있지 않은 문자열이어야 합니다." },
      { status: 400 },
    );
  }
  const description = body.description;

  const sessionDoc = await findSessionById(body.sessionId);
  if (!sessionDoc) {
    return NextResponse.json(
      { error: "세션을 찾을 수 없습니다.", code: "SESSION_NOT_FOUND" },
      { status: 404 },
    );
  }

  try {
    const candidates = await buildSessionRewardCandidates([sessionDoc]);
    const candidate = candidates[0];

    const sessionTitle = sessionDoc.title;
    const sessionDate = new Date(sessionDoc.targetDateTime).toISOString();
    const sessionIdStr = String(sessionDoc._id);

    const results: BulkGrantResultItem[] = [];
    for (const respondent of candidate.respondents) {
      const item = await processRespondent({
        respondent,
        amount,
        description,
        sessionMeta: {
          sessionId: sessionIdStr,
          sessionTitle,
          sessionDate,
        },
        session: { id: session.user.id, displayName: session.user.displayName },
      });
      results.push(item);
    }

    const succeeded = results.filter((r) => r.success).length;
    const skipped = results.filter((r) => r.skipped).length;
    const failed = results.filter((r) => !r.success && !r.skipped).length;

    const response: BulkGrantResult = {
      results,
      succeeded,
      failed,
      skipped,
    };

    return NextResponse.json(response, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "세션 자동 보상 발급 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/* ────────────────────────────────────────────────────────────── *
 * 공통 — POST 처리 (eligibility 결과 → 발급)
 * ────────────────────────────────────────────────────────────── */

interface ProcessRespondentArgs {
  respondent: SessionRespondent;
  amount: number;
  description: string;
  sessionMeta: {
    sessionId: string;
    sessionTitle: string;
    sessionDate: string;
  };
  session: { id: string; displayName: string };
}

async function processRespondent(
  args: ProcessRespondentArgs,
): Promise<BulkGrantResultItem> {
  const { respondent, amount, description, sessionMeta, session } = args;

  if (respondent.status === "already-rewarded") {
    return {
      ownerId: respondent.ownerId ?? undefined,
      characterId: respondent.characterId ?? undefined,
      success: false,
      skipped: true,
      skipReason: "이미 자동 보상 발급됨",
      characterCodename: respondent.characterCodename ?? undefined,
    };
  }

  if (respondent.status !== "eligible") {
    return {
      ownerId: respondent.ownerId ?? undefined,
      characterId: respondent.characterId ?? undefined,
      success: false,
      error: respondent.reason ?? respondent.status,
      code: STATUS_TO_CODE[respondent.status],
      characterCodename: respondent.characterCodename ?? undefined,
    };
  }

  // 이 시점부터 ownerId / characterId / characterCodename 모두 존재.
  if (
    !respondent.ownerId ||
    !respondent.characterId ||
    !respondent.characterCodename
  ) {
    return {
      ownerId: respondent.ownerId ?? undefined,
      characterId: respondent.characterId ?? undefined,
      success: false,
      error: "eligible 후보의 식별자가 누락되었습니다.",
      code: "ELIGIBLE_MISSING_IDS",
    };
  }

  try {
    const transaction = await addCredit({
      characterId: respondent.characterId,
      characterCodename: respondent.characterCodename,
      ownerId: respondent.ownerId,
      // ownerName 비정규화 — respondent 에는 별도 필드 없으므로 displayName 사용.
      ownerName: respondent.displayName,
      amount,
      type: "SESSION_REWARD",
      description,
      createdById: session.id,
      createdByName: session.displayName,
      // 자동 보상은 항상 발급(양수) — 음수 진입 방지.
      allowNegative: false,
      metadata: {
        sessionId: sessionMeta.sessionId,
        sessionTitle: sessionMeta.sessionTitle,
        sessionDate: sessionMeta.sessionDate,
        autoReward: true,
      },
    });

    return {
      ownerId: respondent.ownerId,
      characterId: respondent.characterId,
      success: true,
      transactionId: String(transaction._id),
      characterCodename: respondent.characterCodename,
      newBalance: transaction.balance,
    };
  } catch (err) {
    // partial unique index `credit_transactions_sessionReward_unique` 가 backstop —
    // 두 GM 동시 발급 race 에서 두 번째 insert 가 E11000 으로 실패 → 이미 보상으로 분류.
    // 응용 레벨 멱등 검사(already-rewarded) 와 결과 일관.
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: number }).code === 11000
    ) {
      return {
        ownerId: respondent.ownerId,
        characterId: respondent.characterId,
        success: false,
        skipped: true,
        skipReason: "이미 자동 보상 발급됨 (race)",
        characterCodename: respondent.characterCodename,
      };
    }
    const message = err instanceof Error ? err.message : "발급 실패";
    return {
      ownerId: respondent.ownerId,
      characterId: respondent.characterId,
      success: false,
      characterCodename: respondent.characterCodename,
      error: message,
      code: "GRANT_FAILED",
    };
  }
}
