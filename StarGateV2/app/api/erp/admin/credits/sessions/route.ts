/**
 * GM 크레딧 운영 대시보드 — 세션 자동 보상 (eligibility + 발급).
 *
 * GET — 최근 daysBack(default 14, max 60) 일 이내 CLOSED 세션의 YES 응답자 후보 목록.
 *   query: daysBack
 *   응답: { candidates: SessionRewardCandidate[] }
 *   각 응답자는 status 라벨링 (eligible / no-user / no-character / integrity-violation / already-rewarded).
 *
 * POST — 선택 세션의 실제 참여자 목록에 복합 자동 보상.
 *   body: { sessionId, description, participants, rewards }
 *   응답: BulkGrantResult { results, succeeded, failed, skipped }
 *   - 이미 동일 세션 보상이 존재하는 reward operation 은 skipped 로 분류.
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
  SessionRewardGrantInput,
  SessionRewardLineInput,
  SessionRewardStatField,
  SessionRewardTarget,
} from "@/types/credit-admin";
import type { UserRole } from "@/types/user";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import {
  adjustCharacterPoints,
  adjustCharacterStat,
} from "@/lib/db/character-points";
import {
  findCharacterById,
  findMainCharacterByOwner,
} from "@/lib/db/characters";
import { addCredit } from "@/lib/db/credits";
import {
  findSessionById,
  listRecentCompletedSessions,
} from "@/lib/db/sessions";
import { findUserById } from "@/lib/db/users";
import { isValidObjectId } from "@/lib/db/utils";

import { buildSessionRewardCandidates } from "@/app/(erp)/erp/admin/credits/_session-rewards";

const DEFAULT_DAYS_BACK = 14;
const MAX_DAYS_BACK = 60;

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

  const body = (await request.json()) as Partial<SessionRewardGrantInput>;

  if (!body.sessionId || !isValidObjectId(body.sessionId)) {
    return NextResponse.json(
      { error: "sessionId가 올바른 ObjectId 형식이 아닙니다." },
      { status: 400 },
    );
  }

  if (!Array.isArray(body.participants) || body.participants.length === 0) {
    return NextResponse.json(
      { error: "participants는 1명 이상이어야 합니다." },
      { status: 400 },
    );
  }
  if (body.participants.length > 100) {
    return NextResponse.json(
      { error: "participants는 최대 100명까지 허용됩니다." },
      { status: 400 },
    );
  }

  if (!Array.isArray(body.rewards) || body.rewards.length === 0) {
    return NextResponse.json(
      { error: "rewards는 1개 이상의 보상 항목이어야 합니다." },
      { status: 400 },
    );
  }
  if (body.rewards.length > 20) {
    return NextResponse.json(
      { error: "rewards는 최대 20개까지 허용됩니다." },
      { status: 400 },
    );
  }

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
    const sessionTitle = sessionDoc.title;
    const sessionDate = new Date(sessionDoc.targetDateTime).toISOString();
    const sessionIdStr = String(sessionDoc._id);
    const participants = await resolveParticipants(body.participants);
    const rewards = normalizeRewards(body.rewards, participants);

    const results: BulkGrantResultItem[] = [];
    for (const item of buildRewardOperations(participants, rewards)) {
      const row = await processRewardOperation({
        operation: item,
        description,
        sessionMeta: {
          sessionId: sessionIdStr,
          sessionTitle,
          sessionDate,
        },
        session: {
          id: session.user.id,
          displayName: session.user.displayName,
          role: session.user.role,
        },
      });
      results.push(row);
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

interface ResolvedParticipant {
  ownerId: string;
  ownerName: string;
  characterId: string;
  characterCodename: string;
}

type NormalizedReward = Required<
  Pick<SessionRewardLineInput, "kind" | "amount">
> &
  Pick<SessionRewardLineInput, "statField" | "targetCharacterId"> & {
    label: string;
  };

interface RewardOperation {
  participant: ResolvedParticipant;
  reward: NormalizedReward;
}

async function resolveParticipants(
  targets: SessionRewardTarget[],
): Promise<ResolvedParticipant[]> {
  const seen = new Set<string>();
  const resolved: ResolvedParticipant[] = [];

  for (const target of targets) {
    const participant = await resolveParticipant(target);
    if (seen.has(participant.characterId)) continue;
    seen.add(participant.characterId);
    resolved.push(participant);
  }

  if (resolved.length === 0) {
    throw new Error("지급 가능한 참여자가 없습니다.");
  }
  return resolved;
}

async function resolveParticipant(
  target: SessionRewardTarget,
): Promise<ResolvedParticipant> {
  let character;
  if (target.characterId?.trim()) {
    if (!isValidObjectId(target.characterId)) {
      throw new Error("참여자 characterId가 올바른 ObjectId 형식이 아닙니다.");
    }
    character = await findCharacterById(target.characterId);
  } else if (target.ownerId?.trim()) {
    if (!isValidObjectId(target.ownerId)) {
      throw new Error("참여자 ownerId가 올바른 ObjectId 형식이 아닙니다.");
    }
    character = await findMainCharacterByOwner(target.ownerId);
  } else {
    throw new Error("참여자에는 ownerId 또는 characterId가 필요합니다.");
  }

  if (!character || character.type !== "AGENT") {
    throw new Error("참여자 AGENT 캐릭터를 찾을 수 없습니다.");
  }
  if (!character.ownerId) {
    throw new Error(`${character.codename} 캐릭터에 owner가 연결되어 있지 않습니다.`);
  }

  const owner = await findUserById(character.ownerId);
  return {
    ownerId: character.ownerId,
    ownerName: owner?.discordUsername ?? owner?.displayName ?? character.ownerId,
    characterId: String(character._id),
    characterCodename: character.codename,
  };
}

function normalizeRewards(
  rewards: SessionRewardLineInput[],
  participants: ResolvedParticipant[],
): NormalizedReward[] {
  const participantIds = new Set(participants.map((p) => p.characterId));
  return rewards.map((reward, index) => {
    if (!["CREDIT", "POINT", "STAT"].includes(reward.kind)) {
      throw new Error(`rewards[${index}].kind가 올바르지 않습니다.`);
    }
    if (!Number.isFinite(reward.amount) || reward.amount === 0) {
      throw new Error(`rewards[${index}].amount가 올바르지 않습니다.`);
    }
    if (reward.kind === "CREDIT" && reward.amount <= 0) {
      throw new Error("CREDIT 보상은 0보다 커야 합니다.");
    }
    if (reward.kind === "POINT") {
      if (reward.amount <= 0 || !Number.isInteger(reward.amount)) {
        throw new Error("POINT 보상은 0보다 큰 정수여야 합니다.");
      }
    }
    if (reward.kind === "STAT") {
      if (
        !reward.statField ||
        !["hp", "san", "def", "atk"].includes(reward.statField)
      ) {
        throw new Error("STAT 보상에는 hp/san/def/atk 중 하나가 필요합니다.");
      }
      if (!Number.isInteger(reward.amount)) {
        throw new Error("STAT 보상 수치는 정수여야 합니다.");
      }
    }
    if (
      reward.targetCharacterId &&
      !participantIds.has(reward.targetCharacterId)
    ) {
      throw new Error("개별 보상 대상은 참여자 목록 안에 있어야 합니다.");
    }

    return {
      kind: reward.kind,
      amount: reward.amount,
      statField: reward.statField,
      targetCharacterId: reward.targetCharacterId ?? null,
      label: formatRewardLabel(reward),
    };
  });
}

function buildRewardOperations(
  participants: ResolvedParticipant[],
  rewards: NormalizedReward[],
): RewardOperation[] {
  const operations: RewardOperation[] = [];
  for (const reward of rewards) {
    const targets = reward.targetCharacterId
      ? participants.filter((p) => p.characterId === reward.targetCharacterId)
      : participants;
    for (const participant of targets) {
      operations.push({ participant, reward: { ...reward } });
    }
  }
  return coalesceRewardOperations(operations);
}

function coalesceRewardOperations(
  operations: RewardOperation[],
): RewardOperation[] {
  const byKey = new Map<string, RewardOperation>();
  for (const operation of operations) {
    const statKey =
      operation.reward.kind === "STAT" ? operation.reward.statField : "";
    const key = [
      operation.participant.characterId,
      operation.reward.kind,
      statKey,
    ].join(":");
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, operation);
      continue;
    }
    prev.reward.amount += operation.reward.amount;
    prev.reward.label = formatRewardLabel(prev.reward);
  }
  return Array.from(byKey.values()).filter((op) => op.reward.amount !== 0);
}

function formatRewardLabel(reward: Pick<NormalizedReward, "kind" | "amount" | "statField">): string {
  if (reward.kind === "CREDIT") return `크레딧 +${reward.amount} CR`;
  if (reward.kind === "POINT") return `포인트 +${reward.amount} PT`;
  const sign = reward.amount > 0 ? "+" : "";
  return `${reward.statField?.toUpperCase()} ${sign}${reward.amount}`;
}

async function processRewardOperation(args: {
  operation: RewardOperation;
  description: string;
  sessionMeta: {
    sessionId: string;
    sessionTitle: string;
    sessionDate: string;
  };
  session: { id: string; displayName: string; role: UserRole };
}): Promise<BulkGrantResultItem> {
  const { operation, description, sessionMeta, session } = args;
  const { participant, reward } = operation;
  const base = {
    ownerId: participant.ownerId,
    characterId: participant.characterId,
    characterCodename: participant.characterCodename,
    rewardLabel: reward.label,
    rewardKind: reward.kind,
    ...(reward.statField ? { statField: reward.statField } : {}),
  };

  try {
    if (reward.kind === "CREDIT") {
      const transaction = await addCredit({
        characterId: participant.characterId,
        characterCodename: participant.characterCodename,
        ownerId: participant.ownerId,
        ownerName: participant.ownerName,
        amount: reward.amount,
        type: "SESSION_REWARD",
        description,
        createdById: session.id,
        createdByName: session.displayName,
        allowNegative: false,
        metadata: {
          sessionId: sessionMeta.sessionId,
          sessionTitle: sessionMeta.sessionTitle,
          sessionDate: sessionMeta.sessionDate,
          autoReward: true,
          rewardKind: "CREDIT",
        },
      });
      return {
        ...base,
        success: true,
        transactionId: String(transaction._id),
        newBalance: transaction.balance,
      };
    }

    if (reward.kind === "POINT") {
      const pointResult = await adjustCharacterPoints({
        characterId: participant.characterId,
        amount: reward.amount,
        actorId: session.id,
        actorRole: session.role,
        reason: description,
        allowNegative: false,
        metadata: {
          sessionId: sessionMeta.sessionId,
          sessionTitle: sessionMeta.sessionTitle,
          sessionDate: sessionMeta.sessionDate,
          autoReward: true,
          rewardKind: "POINT",
        },
      });
      return {
        ...base,
        success: true,
        transactionId: pointResult.changeLogId,
        newPointBalance: pointResult.after,
      };
    }

    const statResult = await adjustCharacterStat({
      characterId: participant.characterId,
      field: reward.statField as SessionRewardStatField,
      amount: reward.amount,
      actorId: session.id,
      actorRole: session.role,
      reason: description,
      metadata: {
        sessionId: sessionMeta.sessionId,
        sessionTitle: sessionMeta.sessionTitle,
        sessionDate: sessionMeta.sessionDate,
        autoReward: true,
        rewardKind: "STAT",
        statField: reward.statField ?? null,
      },
    });
    return {
      ...base,
      success: true,
      transactionId: statResult.changeLogId,
      newStatValue: statResult.after,
    };
  } catch (err) {
    if (isDuplicateRewardError(err)) {
      return {
        ...base,
        success: false,
        skipped: true,
        skipReason: "이미 해당 세션 보상 발급됨",
      };
    }
    return {
      ...base,
      success: false,
      error: err instanceof Error ? err.message : "발급 실패",
      code: "GRANT_FAILED",
    };
  }
}

function isDuplicateRewardError(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code?: number }).code === 11000
  );
}
