/**
 * GM 크레딧 운영 대시보드 — 일괄 발급 (부분 실패 허용).
 *
 * Body: BulkGrantInput
 * - targets: BulkGrantTarget[] (1~100)
 * - amount: 0 이 아닌 number (ADMIN_DEDUCT 면 자동으로 음수 적용)
 * - type: ADMIN_GRANT | ADMIN_DEDUCT | SESSION_REWARD (GM_DIRECT_GRANT_TYPES)
 * - description: string
 * - metadata?: Record<string, primitive>
 *
 * 부분 실패 허용 (mongo transaction 미도입 정책). 50명 발급 중 3명 실패 → 47명 처리.
 * 순차 처리 — Promise.all 시 단일 mongo 커넥션 부하 + race 확장.
 *
 * 응답: BulkGrantResult { results, succeeded, failed, skipped: 0 } (200).
 * - skipped 는 본 라우트에서 항상 0 (세션 자동 보상에서만 사용).
 *
 * 응답 코드: 401 / 403 / 400 (입력 검증 실패) / 500.
 */

import { NextResponse } from "next/server";

import type {
  BulkGrantResult,
  BulkGrantResultItem,
  BulkGrantTarget,
  RewardKind,
} from "@/types/credit-admin";
import type { GmDirectGrantType } from "@/types/credit";
import type { UserRole } from "@/types/user";

import { isGmDirectGrantType } from "@/types/credit";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import { isCreditOperationCharacter } from "@/lib/character-operation-targets";
import {
  findCharacterById,
  findMainCharacterLiteByOwner as findMainCharacterByOwner,
} from "@/lib/db/characters";
import { addCredit } from "@/lib/db/credits";
import { adjustCharacterPoints } from "@/lib/db/character-points";
import { findUserById } from "@/lib/db/users";
import { isValidObjectId } from "@/lib/db/utils";
import { grantStockReward } from "@/lib/stocks/rewards";
import {
  formatSignedAmount,
  notifyUser,
} from "@/lib/notifications/events";

const MAX_TARGETS = 100;

function getCreditNotificationTitle(
  type: GmDirectGrantType,
  amount: number,
): string {
  if (type === "ADMIN_DEDUCT" || amount < 0) return "크레딧이 차감되었습니다";
  if (type === "SESSION_REWARD") return "세션 보상이 지급되었습니다";
  return "크레딧이 지급되었습니다";
}

function appendDescription(parts: string[], description: string): string[] {
  const trimmed = description.trim();
  if (!trimmed) return parts;
  return [...parts, trimmed];
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

  // body 는 신뢰 X — array shape / amount / type / description / targets element 모두 검증.
  const body = (await request.json()) as {
    targets?: unknown;
    amount?: unknown;
    type?: unknown;
    description?: unknown;
    rewardKind?: unknown;
    stockTicker?: unknown;
  };

  if (!Array.isArray(body.targets) || body.targets.length === 0) {
    return NextResponse.json(
      { error: "targets는 1개 이상의 배열이어야 합니다." },
      { status: 400 },
    );
  }
  if (body.targets.length > MAX_TARGETS) {
    return NextResponse.json(
      { error: `targets는 최대 ${MAX_TARGETS}개까지 허용됩니다.` },
      { status: 400 },
    );
  }

  // amount 는 양수 (UI input min=1) — type 으로 부호 결정. API 직접 호출 시 음수 입력하면
  // ADMIN_DEDUCT 의 -Math.abs 가 두 번 부호 뒤집어 양수 발급되는 silent corruption 차단.
  if (
    typeof body.amount !== "number" ||
    !Number.isFinite(body.amount) ||
    body.amount <= 0
  ) {
    return NextResponse.json(
      { error: "amount는 0보다 큰 유한 숫자여야 합니다 (부호는 type 으로 결정)." },
      { status: 400 },
    );
  }

  if (!isGmDirectGrantType(body.type)) {
    return NextResponse.json(
      {
        error:
          "type은 ADMIN_GRANT, ADMIN_DEDUCT, SESSION_REWARD 중 하나여야 합니다.",
      },
      { status: 400 },
    );
  }
  if (
    body.rewardKind !== undefined &&
    body.rewardKind !== "CREDIT" &&
    body.rewardKind !== "POINT" &&
    body.rewardKind !== "STOCK"
  ) {
    return NextResponse.json(
      { error: "rewardKind must be CREDIT, POINT, or STOCK." },
      { status: 400 },
    );
  }
  const rewardKind: RewardKind =
    body.rewardKind === "POINT"
      ? "POINT"
      : body.rewardKind === "STOCK"
        ? "STOCK"
        : "CREDIT";
  if (
    (rewardKind === "POINT" || rewardKind === "STOCK") &&
    !Number.isInteger(body.amount)
  ) {
    return NextResponse.json(
      { error: "POINT/STOCK 조정 amount는 정수여야 합니다." },
      { status: 400 },
    );
  }
  if (rewardKind === "STOCK" && body.type === "ADMIN_DEDUCT") {
    return NextResponse.json(
      { error: "STOCK 보상은 차감 유형으로 처리할 수 없습니다." },
      { status: 400 },
    );
  }
  if (rewardKind === "STOCK" && typeof body.stockTicker !== "string") {
    return NextResponse.json(
      { error: "STOCK 보상에는 stockTicker가 필요합니다." },
      { status: 400 },
    );
  }

  if (typeof body.description !== "string") {
    return NextResponse.json(
      { error: "description은 문자열이어야 합니다 (빈 문자열 허용)." },
      { status: 400 },
    );
  }

  // targets element shape — 1건 잘못된 입력으로 100건 throw 방지 (D3 부분 실패 정책).
  // metadata 는 외부에서 주입 시 sessionId/autoReward 같은 시스템 키로 멱등 검사 오염 가능 →
  // 본 라우트에서는 받지 않음 (자동 보상은 sessions 라우트가 자체 마킹).
  // 동시에 동일 ownerId/characterId 중복 발급 차단 — paste 모드 / 외부 호출에서
  // 같은 ID 가 N번 들어와 silent N회 발급되는 corruption 방지.
  const targets: BulkGrantTarget[] = [];
  const seenOwnerIds = new Set<string>();
  const seenCharacterIds = new Set<string>();
  for (let i = 0; i < body.targets.length; i++) {
    const t = body.targets[i];
    if (typeof t !== "object" || t === null) {
      return NextResponse.json(
        { error: `targets[${i}] 는 object 가 아닙니다.` },
        { status: 400 },
      );
    }
    const { ownerId, characterId } = t as {
      ownerId?: unknown;
      characterId?: unknown;
    };
    if (ownerId !== undefined && typeof ownerId !== "string") {
      return NextResponse.json(
        { error: `targets[${i}].ownerId 는 문자열이어야 합니다.` },
        { status: 400 },
      );
    }
    if (characterId !== undefined && typeof characterId !== "string") {
      return NextResponse.json(
        { error: `targets[${i}].characterId 는 문자열이어야 합니다.` },
        { status: 400 },
      );
    }
    if (ownerId && seenOwnerIds.has(ownerId)) {
      return NextResponse.json(
        {
          error: `targets[${i}].ownerId 가 중복입니다 — 같은 대상에 한 번만 발급 가능합니다.`,
          code: "DUPLICATE_TARGET",
        },
        { status: 400 },
      );
    }
    if (characterId && seenCharacterIds.has(characterId)) {
      return NextResponse.json(
        {
          error: `targets[${i}].characterId 가 중복입니다.`,
          code: "DUPLICATE_TARGET",
        },
        { status: 400 },
      );
    }
    if (ownerId) seenOwnerIds.add(ownerId);
    if (characterId) seenCharacterIds.add(characterId);
    targets.push({ ownerId, characterId });
  }

  const validatedType = body.type;
  const validatedAmount = body.amount;
  const description = body.description;
  // ADMIN_DEDUCT 는 음수, 그 외는 양수.
  const finalAmount =
    validatedType === "ADMIN_DEDUCT" ? -validatedAmount : validatedAmount;

  // 순차 처리 — Promise.all 시 mongo 커넥션 부하 + balance race window 확장.
  // 각 target 의 인프라 에러 (mongo timeout 등) 도 element-level 로 격리하여 partial result 보존.
  const results: BulkGrantResultItem[] = [];
  for (const target of targets) {
    let item: BulkGrantResultItem;
    try {
      item = await processTarget({
        target,
        finalAmount,
        validatedType,
        rewardKind,
        stockTicker:
          rewardKind === "STOCK" ? String(body.stockTicker).trim() : undefined,
        description,
        session: {
          id: session.user.id,
          displayName: session.user.displayName,
          role: session.user.role,
        },
      });
    } catch (err) {
      item = {
        ownerId: target.ownerId,
        characterId: target.characterId,
        success: false,
        error: err instanceof Error ? err.message : "internal error",
        code: "INTERNAL_ERROR",
      };
    }
    results.push(item);
  }

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success && !r.skipped).length;

  const response: BulkGrantResult = {
    results,
    succeeded,
    failed,
    skipped: 0,
  };

  return NextResponse.json(response, {
    headers: { "Cache-Control": "no-store" },
  });
}

interface ProcessArgs {
  target: BulkGrantTarget;
  finalAmount: number;
  validatedType: GmDirectGrantType;
  rewardKind: RewardKind;
  stockTicker?: string;
  description: string;
  session: { id: string; displayName: string; role: UserRole };
}

async function processTarget(args: ProcessArgs): Promise<BulkGrantResultItem> {
  const {
    target,
    finalAmount,
    validatedType,
    rewardKind,
    stockTicker,
    description,
    session,
  } = args;
  const baseEcho: BulkGrantResultItem = {
    ownerId: target.ownerId,
    characterId: target.characterId,
    success: false,
  };

  // characterId / ownerId 둘 다 비어있으면 검증 실패.
  if (!target.characterId?.trim() && !target.ownerId?.trim()) {
    return {
      ...baseEcho,
      error: "characterId 또는 ownerId가 필요합니다.",
      code: "MISSING_TARGET",
    };
  }

  let targetCharacterId: string;
  let targetCharacterCodename: string;
  let targetOwnerId: string;
  let targetCharacterType: "AGENT" | "NPC";

  if (target.characterId?.trim()) {
    if (!isValidObjectId(target.characterId)) {
      return {
        ...baseEcho,
        error: "characterId가 올바른 ObjectId 형식이 아닙니다.",
        code: "INVALID_CHARACTER_ID",
      };
    }
    const character = await findCharacterById(target.characterId);
    if (!character || !(await isCreditOperationCharacter(character))) {
      return {
        ...baseEcho,
        error: "운영 대상 캐릭터를 찾을 수 없습니다.",
        code: "CHARACTER_NOT_FOUND",
      };
    }
    if (!character.ownerId) {
      return {
        ...baseEcho,
        error: "캐릭터에 owner가 연결되어 있지 않습니다.",
        code: "NO_OWNER",
      };
    }
    targetCharacterId = String(character._id);
    targetCharacterCodename = character.codename;
    targetOwnerId = character.ownerId;
    targetCharacterType = character.type;
  } else {
    const ownerId = target.ownerId!;
    if (!isValidObjectId(ownerId)) {
      return {
        ...baseEcho,
        error: "ownerId가 올바른 ObjectId 형식이 아닙니다.",
        code: "INVALID_OWNER_ID",
      };
    }
    let mainCharacter;
    try {
      mainCharacter = await findMainCharacterByOwner(ownerId);
    } catch (err) {
      return {
        ...baseEcho,
        error: err instanceof Error ? err.message : "메인 캐릭터 정합성 위반",
        code: "MAIN_CHARACTER_INTEGRITY",
      };
    }
    if (!mainCharacter) {
      return {
        ...baseEcho,
        error: "메인 캐릭터 미등록.",
        code: "NO_MAIN_CHARACTER",
      };
    }
    targetCharacterId = String(mainCharacter._id);
    targetCharacterCodename = mainCharacter.codename;
    targetOwnerId = ownerId;
    targetCharacterType = mainCharacter.type;
  }

  const owner = await findUserById(targetOwnerId);
  if (!owner) {
    return {
      ...baseEcho,
      characterId: targetCharacterId,
      ownerId: targetOwnerId,
      error: "owner user 정보를 찾을 수 없습니다.",
      code: "OWNER_USER_NOT_FOUND",
    };
  }
  const ownerName = owner.discordUsername ?? owner.displayName;

  try {
    if (rewardKind === "POINT") {
      if (targetCharacterType !== "AGENT") {
        return {
          ownerId: targetOwnerId,
          characterId: targetCharacterId,
          success: false,
          characterCodename: targetCharacterCodename,
          error: "POINT 조정은 AGENT 캐릭터에만 가능합니다.",
          code: "CHARACTER_NOT_AGENT",
        };
      }

      const pointResult = await adjustCharacterPoints({
        characterId: targetCharacterId,
        amount: finalAmount,
        actorId: session.id,
        actorRole: session.role,
        reason: description || `${validatedType} point adjustment`,
        allowNegative: false,
        metadata: {
          rewardKind: "POINT",
          grantType: validatedType,
        },
      });
      await notifyUser({
        userId: targetOwnerId,
        type: "SYSTEM",
        title:
          finalAmount < 0
            ? "작전 포인트가 차감되었습니다"
            : "작전 포인트가 지급되었습니다",
        message: appendDescription(
          [
            `${targetCharacterCodename} · ${formatSignedAmount(finalAmount, "PT")}`,
            `현재 포인트 ${pointResult.after.toLocaleString()} PT`,
          ],
          description,
        ).join(" · "),
        link: `/erp/characters/${targetCharacterId}`,
      });

      return {
        ownerId: targetOwnerId,
        characterId: targetCharacterId,
        success: true,
        transactionId: pointResult.changeLogId,
        characterCodename: targetCharacterCodename,
        newPointBalance: pointResult.after,
      };
    }

    if (rewardKind === "STOCK") {
      const stockResult = await grantStockReward({
        characterId: targetCharacterId,
        ticker: stockTicker ?? "",
        shares: finalAmount,
      });
      await notifyUser({
        userId: targetOwnerId,
        type: "SYSTEM",
        title: "주식 보상이 지급되었습니다",
        message: appendDescription(
          [
            `${targetCharacterCodename} · ${stockResult.stockName} (${stockResult.ticker}) +${stockResult.shares.toLocaleString()}주`,
            `보유 수량 ${stockResult.holding.shares.toLocaleString()}주`,
          ],
          description,
        ).join(" · "),
        link: `/erp/stock/${encodeURIComponent(stockResult.ticker)}`,
      });

      return {
        ownerId: targetOwnerId,
        characterId: targetCharacterId,
        success: true,
        transactionId: String(stockResult.holding._id ?? ""),
        characterCodename: targetCharacterCodename,
        rewardLabel: `주식 ${stockResult.ticker} +${stockResult.shares.toLocaleString()}주`,
        rewardKind: "STOCK",
        stockTicker: stockResult.ticker,
        newStockShares: stockResult.holding.shares,
        newStockAvgPrice: stockResult.holding.avgPrice,
      };
    }

    const transaction = await addCredit({
      characterId: targetCharacterId,
      characterCodename: targetCharacterCodename,
      ownerId: targetOwnerId,
      ownerName,
      amount: finalAmount,
      type: validatedType,
      description,
      createdById: session.id,
      createdByName: session.displayName,
      // ADMIN_DEDUCT 만 음수 진입 허용. SESSION_REWARD/ADMIN_GRANT 는 양수라 무관.
      allowNegative: validatedType === "ADMIN_DEDUCT",
      // metadata 는 본 라우트에서 받지 않음 — 외부 주입 시 자동 보상 멱등 검사 오염 가능.
    });
    await notifyUser({
      userId: targetOwnerId,
      type: "CREDIT_RECEIVED",
      title: getCreditNotificationTitle(validatedType, transaction.amount),
      message: appendDescription(
        [
          `${targetCharacterCodename} · ${formatSignedAmount(transaction.amount, "CR")}`,
          `현재 잔액 ${transaction.balance.toLocaleString()} CR`,
        ],
        transaction.description,
      ).join(" · "),
      link: "/erp/credits",
    });

    return {
      ownerId: targetOwnerId,
      characterId: targetCharacterId,
      success: true,
      transactionId: String(transaction._id),
      characterCodename: targetCharacterCodename,
      newBalance: transaction.balance,
    };
  } catch (err) {
    if (err instanceof Error && err.message === "INSUFFICIENT_POINTS") {
      return {
        ownerId: targetOwnerId,
        characterId: targetCharacterId,
        success: false,
        characterCodename: targetCharacterCodename,
        error: "Point balance is insufficient.",
        code: "INSUFFICIENT_POINTS",
      };
    }
    if (err instanceof Error && err.message.includes("음수 잔액")) {
      return {
        ownerId: targetOwnerId,
        characterId: targetCharacterId,
        success: false,
        characterCodename: targetCharacterCodename,
        error: "잔액이 부족합니다.",
        code: "INSUFFICIENT_BALANCE",
      };
    }
    const message = err instanceof Error ? err.message : "발급 실패";
    return {
      ownerId: targetOwnerId,
      characterId: targetCharacterId,
      success: false,
      characterCodename: targetCharacterCodename,
      error: message,
      code: "GRANT_FAILED",
    };
  }
}
