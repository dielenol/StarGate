import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";

import {
  ADMIN_ALLOWED_CHARACTER_FIELDS,
  PLAYER_ALLOWED_CHARACTER_FIELDS,
  insertChangeLog,
} from "@stargate/shared-db";

import { auth } from "@/lib/auth/config";
import { canEditCharacter, requireRole } from "@/lib/auth/rbac";
import { checkEditCooldown } from "@/lib/character/cooldown";
import { computeCharacterDiff } from "@/lib/character/diff";
import {
  findCharacterById,
  updateCharacter,
  deleteCharacter,
} from "@/lib/db/characters";
import { isValidObjectId } from "@/lib/db/utils";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "잘못된 ID 형식입니다." }, { status: 400 });
  }

  try {
    const character = await findCharacterById(id);
    if (!character) {
      return NextResponse.json(
        { error: "캐릭터를 찾을 수 없습니다." },
        { status: 404 },
      );
    }
    return NextResponse.json({ character });
  } catch (err) {
    const message = err instanceof Error ? err.message : "캐릭터 조회 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "잘못된 ID 형식입니다." }, { status: 400 });
  }

  // 존재 여부와 권한 응답을 통합 — 권한 없는 사용자에게 캐릭터 존재 누설(404 vs 403 oracle) 차단.
  const before = await findCharacterById(id);
  const decision = canEditCharacter(
    session.user.id,
    session.user.role,
    before ?? { ownerId: null },
  );
  if (!before || decision.mode === "none") {
    if (before && decision.mode === "none") {
      console.warn(
        `[characters PATCH] denied user=${session.user.id} character=${id} reason=${decision.reason}`,
      );
    }
    return NextResponse.json(
      { error: "캐릭터를 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  // 모드별 화이트리스트. admin = 전체, player = 서사 7필드만.
  const allowedFields =
    decision.mode === "admin"
      ? ADMIN_ALLOWED_CHARACTER_FIELDS
      : PLAYER_ALLOWED_CHARACTER_FIELDS;

  /**
   * 쿨다운 enforcement (P6) — player 모드에만 적용.
   * admin 은 운영 책임 영역이라 별도 throttle 없음 (감사 로그로만 추적).
   * 응답에 used/remaining/resetAt 을 포함해 클라이언트가 안내 메시지/카운트다운에 활용.
   */
  if (decision.mode === "player") {
    const status = await checkEditCooldown(session.user.id);
    if (!status.allowed) {
      return NextResponse.json(
        {
          error: "편집 쿨다운에 걸렸습니다. 잠시 후 다시 시도해 주세요.",
          cooldown: {
            used: status.used,
            remaining: status.remaining,
            resetAt: status.resetAt.toISOString(),
            windowHours: status.windowHours,
            maxCount: status.maxCount,
          },
        },
        { status: 429 },
      );
    }
  }

  // body 형식은 admin / player 모드에 따라 다름 (sheet 통째 vs sheet 부분객체).
  // 화이트리스트는 shared-db buildUpdatePatch 가 dot path 기준으로 안전 추출.
  const body = (await request.json()) as Record<string, unknown>;

  try {
    const updated = await updateCharacter(id, body, { allowedFields });
    if (!updated) {
      return NextResponse.json(
        { error: "캐릭터를 찾을 수 없거나 변경 사항이 없습니다." },
        { status: 404 },
      );
    }

    /**
     * Audit 기록 (P6) — update 가 성공한 후 best-effort 로 changes log 를 남긴다.
     *
     * - 트랜잭션 미사용 정책이라 audit insert 실패가 사용자 응답에 영향을 주지 않도록
     *   try/catch 로 격리. 실패는 console.warn 만 기록 (P7 에서 alert/webhook 도입 시 강화).
     * - diff 가 비어 있으면 (예: 동일값 재전송) insert 자체를 생략 — 노이즈 방지.
     * - actorIsOwner 는 ownerId 직접 비교. session.user.id 가 빈 문자열일 가능성은
     *   canEditCharacter 가 unauthenticated 로 차단하므로 여기엔 도달하지 않음.
     */
    try {
      const after = await findCharacterById(id);
      if (after) {
        const changes = computeCharacterDiff(before, after, allowedFields);
        if (changes.length > 0) {
          await insertChangeLog({
            characterId: new ObjectId(id),
            actorId: session.user.id,
            actorRole: session.user.role,
            actorIsOwner: before.ownerId === session.user.id,
            source: decision.mode === "admin" ? "admin" : "player",
            changes,
          });
        }
      }
    } catch (auditErr) {
      console.warn(
        `[characters PATCH] audit insert failed user=${session.user.id} character=${id}:`,
        auditErr,
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "캐릭터 수정 실패";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requireRole(session.user.role, "GM");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "잘못된 ID 형식입니다." }, { status: 400 });
  }

  try {
    const deleted = await deleteCharacter(id);
    if (!deleted) {
      return NextResponse.json(
        { error: "캐릭터를 찾을 수 없습니다." },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "캐릭터 삭제 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
