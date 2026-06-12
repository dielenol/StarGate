import { NextResponse } from "next/server";

import type { CreditTransactionType } from "@/types/credit";

import { GM_DIRECT_GRANT_TYPES, isGmDirectGrantType } from "@/types/credit";

import { auth } from "@/lib/auth/config";
import { hasRole, requireRole } from "@/lib/auth/rbac";
import {
  findCharacterById,
  findMainCharacterLiteByOwner as findMainCharacterByOwner,
} from "@/lib/db/characters";
import {
  addCredit,
  getCharacterBalance,
  listCreditTransactions,
} from "@/lib/db/credits";
import { findUserById } from "@/lib/db/users";
import { isValidObjectId } from "@/lib/db/utils";
import {
  formatSignedAmount,
  notifyUser,
} from "@/lib/notifications/events";

function getCreditNotificationTitle(
  type: CreditTransactionType,
  amount: number,
): string {
  if (type === "ADMIN_DEDUCT" || amount < 0) return "크레딧이 차감되었습니다";
  if (type === "SESSION_REWARD") return "세션 보상이 지급되었습니다";
  return "크레딧이 지급되었습니다";
}

function getCreditNotificationMessage(input: {
  characterCodename: string;
  amount: number;
  balance: number;
  description: string;
}): string {
  const description = input.description.trim();
  const lines = [
    `${input.characterCodename} · ${formatSignedAmount(input.amount, "CR")}`,
    `현재 잔액 ${input.balance.toLocaleString()} CR`,
  ];
  if (description) lines.push(description);
  return lines.join(" · ");
}

/* ── GET: ledger + balance 조회 ── */

/**
 * 본인의 메인 캐릭 ledger 조회. V+ 권한이면 query 로 다른 user/캐릭터 조회 가능.
 *
 * Query params (V+ 권한 한정):
 * - `characterId`: 직접 지정 (우선순위 1)
 * - `ownerId`: 해당 owner 의 메인 캐릭 자동 라우팅 (우선순위 2)
 *
 * 응답 코드 정책:
 * - 메인 캐릭 미등록 → 404 (`code=NO_MAIN_CHARACTER`) — V+ ownerId 조회와 일관.
 * - 1인 1 MAIN 위반 (`findMainCharacterByOwner` throw) → 409 정합성 위반.
 * - 그 외 예외 → 500.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const isPrivileged = hasRole(session.user.role, "V");
    const url = new URL(request.url);
    const queryCharacterId = url.searchParams.get("characterId");
    const queryOwnerId = url.searchParams.get("ownerId");

    let targetCharacterId: string | null = null;
    let targetCharacterCodename = "";

    if (queryCharacterId && isPrivileged) {
      if (!isValidObjectId(queryCharacterId)) {
        return NextResponse.json(
          { error: "characterId가 올바른 ObjectId 형식이 아닙니다." },
          { status: 400 },
        );
      }
      const character = await findCharacterById(queryCharacterId);
      if (!character || character.type !== "AGENT") {
        return NextResponse.json(
          { error: "AGENT 캐릭터를 찾을 수 없습니다." },
          { status: 404 },
        );
      }
      targetCharacterId = String(character._id);
      targetCharacterCodename = character.codename;
    } else if (queryOwnerId && isPrivileged) {
      if (!isValidObjectId(queryOwnerId)) {
        return NextResponse.json(
          { error: "ownerId가 올바른 ObjectId 형식이 아닙니다." },
          { status: 400 },
        );
      }
      let main;
      try {
        main = await findMainCharacterByOwner(queryOwnerId);
      } catch (err) {
        // 1인 1 MAIN 위반 (정합성 위반) — 409.
        const message =
          err instanceof Error ? err.message : "메인 캐릭터 조회 실패 (정합성 위반)";
        return NextResponse.json(
          { error: message, code: "MAIN_CHARACTER_INTEGRITY" },
          { status: 409 },
        );
      }
      if (!main) {
        return NextResponse.json(
          {
            error: "메인 캐릭터 미등록 — 캐릭터 등록 후 다시 시도하세요.",
            code: "NO_MAIN_CHARACTER",
          },
          { status: 404 },
        );
      }
      targetCharacterId = String(main._id);
      targetCharacterCodename = main.codename;
    } else {
      // 본인 메인 캐릭. 1인 1 MAIN 위반(throw) 과 정상 미등록(null) 을 분리.
      let main;
      try {
        main = await findMainCharacterByOwner(session.user.id);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "메인 캐릭터 조회 실패 (정합성 위반)";
        return NextResponse.json(
          { error: message, code: "MAIN_CHARACTER_INTEGRITY" },
          { status: 409 },
        );
      }
      if (!main) {
        // V+ ownerId 조회와 일관 — 404 + code.
        return NextResponse.json(
          {
            error: "메인 캐릭터 미등록 — 캐릭터 등록 후 다시 시도하세요.",
            code: "NO_MAIN_CHARACTER",
          },
          { status: 404 },
        );
      }
      targetCharacterId = String(main._id);
      targetCharacterCodename = main.codename;
    }

    const [transactions, balance] = await Promise.all([
      listCreditTransactions(targetCharacterId),
      getCharacterBalance(targetCharacterId),
    ]);

    return NextResponse.json({
      transactions,
      balance,
      characterId: targetCharacterId,
      characterCodename: targetCharacterCodename,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "크레딧 트랜잭션 조회 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/* ── POST: GM 발급 ── */

interface PostBody {
  /** user._id hex — 메인 캐릭으로 자동 라우팅. */
  ownerId?: string;
  /** character._id hex — 직접 지정 (ownerId 보다 우선순위 높음). */
  characterId?: string;
  amount?: number;
  type?: CreditTransactionType;
  description?: string;
}

/**
 * GM 발급 — body 의 `characterId` 우선, 없으면 `ownerId` 의 메인 캐릭으로 라우팅.
 * 둘 다 없으면 400. 메인 캐릭 미등록 user 는 발급 거절 (404).
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // admin UI 분리 후 V 호출처 없음 — admin layout 가드와 일관성.
    // Phase 2 슬림화로 사용자 페이지의 GM 발급 폼 제거됨.
    requireRole(session.user.role, "GM");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as PostBody;

  // characterId / ownerId 둘 중 하나는 필수. characterId 가 우선.
  if (!body.characterId?.trim() && !body.ownerId?.trim()) {
    return NextResponse.json(
      { error: "characterId 또는 ownerId가 필요합니다." },
      { status: 400 },
    );
  }

  // amount 는 양수 강제 (UI 폼은 Math.abs 로 통제하지만 외부 API 직접 호출 시
  // 음수 ADMIN_GRANT 입력 → audit log 와 실제 발생 부호가 어긋나는 silent corruption).
  // 부호는 type 으로 결정 (ADMIN_DEDUCT 만 음수). bulk 라우트와 일관.
  if (typeof body.amount !== "number" || !Number.isFinite(body.amount) || body.amount <= 0) {
    return NextResponse.json(
      { error: "amount는 0보다 큰 유한 숫자여야 합니다 (부호는 type 으로 결정)." },
      { status: 400 },
    );
  }
  const validatedAmount = body.amount;

  if (!isGmDirectGrantType(body.type)) {
    return NextResponse.json(
      {
        error: `type은 ${GM_DIRECT_GRANT_TYPES.join(", ")} 중 하나여야 합니다 (PURCHASE/STOCK_BUY/STOCK_SELL 은 도메인 전용 라우트에서 처리).`,
      },
      { status: 400 },
    );
  }
  // narrow 결과를 await 너머까지 보존하기 위한 캡처 (body.type 은 mutable property).
  const validatedType = body.type;
  const finalAmount =
    validatedType === "ADMIN_DEDUCT" ? -validatedAmount : validatedAmount;

  // 대상 AGENT 캐릭터 해석 — characterId 우선, 미지정 시 ownerId 의 메인 캐릭으로.
  let targetCharacterId: string;
  let targetCharacterCodename: string;
  let targetOwnerId: string;

  if (body.characterId?.trim()) {
    if (!isValidObjectId(body.characterId)) {
      return NextResponse.json(
        { error: "characterId가 올바른 ObjectId 형식이 아닙니다." },
        { status: 400 },
      );
    }
    const character = await findCharacterById(body.characterId);
    if (!character || character.type !== "AGENT") {
      return NextResponse.json(
        { error: "AGENT 캐릭터를 찾을 수 없습니다." },
        { status: 404 },
      );
    }
    if (!character.ownerId) {
      return NextResponse.json(
        { error: "캐릭터에 owner가 연결되어 있지 않습니다 — ledger 발급 불가." },
        { status: 400 },
      );
    }
    targetCharacterId = String(character._id);
    targetCharacterCodename = character.codename;
    targetOwnerId = character.ownerId;
  } else {
    const ownerId = body.ownerId!;
    if (!isValidObjectId(ownerId)) {
      return NextResponse.json(
        { error: "ownerId가 올바른 ObjectId 형식이 아닙니다." },
        { status: 400 },
      );
    }
    let mainCharacter;
    try {
      mainCharacter = await findMainCharacterByOwner(ownerId);
    } catch (err) {
      // findMainCharacterByOwner 가 1인 1 MAIN 위반 시 throw — 정합성 위반(409).
      const message =
        err instanceof Error ? err.message : "메인 캐릭터 조회 실패 (정합성 위반)";
      return NextResponse.json(
        { error: message, code: "MAIN_CHARACTER_INTEGRITY" },
        { status: 409 },
      );
    }
    if (!mainCharacter) {
      return NextResponse.json(
        {
          error:
            "메인 캐릭터 미등록 — 발급 대상 user 가 메인 AGENT 캐릭터를 가지고 있어야 합니다.",
          code: "NO_MAIN_CHARACTER",
        },
        { status: 404 },
      );
    }
    targetCharacterId = String(mainCharacter._id);
    targetCharacterCodename = mainCharacter.codename;
    targetOwnerId = ownerId;
  }

  // ownerName 조회 (audit log 용 비정규화) — discordUsername 우선, fallback displayName.
  const owner = await findUserById(targetOwnerId);
  if (!owner) {
    return NextResponse.json(
      { error: "캐릭터의 owner user 정보를 찾을 수 없습니다." },
      { status: 500 },
    );
  }
  const ownerName = owner.discordUsername ?? owner.displayName;

  /**
   * addCredit 내부 atomic 가드:
   * - 기본은 음수 잔액 거부 (잔액 부족 시 throw → 400).
   * - ADMIN_DEDUCT 만 `allowNegative: true` 로 음수 진입 허용.
   * 사전 `getCharacterBalance` 호출 제거 — race window 단축 + read 1회 절약.
   */
  try {
    const transaction = await addCredit({
      characterId: targetCharacterId,
      characterCodename: targetCharacterCodename,
      ownerId: targetOwnerId,
      ownerName,
      amount: finalAmount,
      type: validatedType,
      description: body.description ?? "",
      createdById: session.user.id,
      createdByName: session.user.displayName,
      allowNegative: validatedType === "ADMIN_DEDUCT",
    });
    await notifyUser({
      userId: targetOwnerId,
      type: "CREDIT_RECEIVED",
      title: getCreditNotificationTitle(validatedType, transaction.amount),
      message: getCreditNotificationMessage({
        characterCodename: targetCharacterCodename,
        amount: transaction.amount,
        balance: transaction.balance,
        description: transaction.description,
      }),
      link: "/erp/credits",
    });

    return NextResponse.json({ transaction }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message.includes("음수 잔액")) {
      return NextResponse.json(
        {
          error:
            "잔액이 부족합니다. 음수 잔액은 허용되지 않습니다 (currentBalance + amount < 0).",
          code: "INSUFFICIENT_BALANCE",
        },
        { status: 400 },
      );
    }
    const message =
      err instanceof Error ? err.message : "크레딧 지급 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
