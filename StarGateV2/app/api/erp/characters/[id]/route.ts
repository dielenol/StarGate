import { ObjectId } from "mongodb";
import { NextResponse, after } from "next/server";

import {
  ALLOWED_LORE_FIELDS_ADMIN,
  ALLOWED_LORE_FIELDS_PLAYER,
  ALLOWED_PLAY_FIELDS_ADMIN,
  insertChangeLog,
  loreSheetSchema,
} from "@stargate/shared-db";

import { auth } from "@/lib/auth/config";
import { canEditLore, canEditPlay, requireRole } from "@/lib/auth/rbac";
import { checkEditCooldown } from "@/lib/character/cooldown";
import { computeCharacterDiff } from "@/lib/character/diff";
import {
  findCharacterById,
  updateCharacter,
  deleteCharacter,
} from "@/lib/db/characters";
import { isValidObjectId } from "@/lib/db/utils";
import { notifyCharacterEdit } from "@/lib/discord";

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

/**
 * PATCH body 형식 (Phase 3+):
 *   {
 *     lore?: PartialLore,            // sub-document 부분 패치 (admin/player 모두 가능, 화이트리스트 분기)
 *     play?: PartialPlay,            // sub-document 부분 패치 (AGENT + admin 한정)
 *     codename?: string,             // root 메타 — admin 전용
 *     role?: string,
 *     tier?: CharacterTier,
 *     isPublic?: boolean,
 *     ownerId?: string | null,
 *     previewImage?: string,
 *     reason?: string,               // audit/webhook 메타 (update 에 반영 안 됨)
 *   }
 *
 * 권한 분기:
 *   - lore patch : `canEditLore` 결정. admin → ALLOWED_LORE_FIELDS_ADMIN, player → ALLOWED_LORE_FIELDS_PLAYER (8필드)
 *   - play patch : `canEditPlay` true 인 경우만 ALLOWED_PLAY_FIELDS_ADMIN 적용 (player 는 빈 셋 → 자동 drop)
 *   - root 메타 (codename/role/tier/...) : admin 만 — ROOT_ALLOWED_FIELDS_ADMIN
 *
 * 권한 없는 sub-document 가 body 에 있어도 silent drop (화이트리스트 가드). 단,
 * 어떤 patch 도 적용되지 않으면 404 ("변경 사항이 없습니다") — TOCTTOU 결과 정합성 유지.
 */
const ROOT_ALLOWED_FIELDS_ADMIN = new Set<string>([
  "codename",
  "tier",
  "role",
  "agentLevel",
  "department",
  "previewImage",
  "pixelCharacterImage",
  "warningVideo",
  "ownerId",
  "isPublic",
  "factionCode",
  "institutionCode",
]);

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
  const loreDecision = canEditLore(
    session.user.id,
    session.user.role,
    before ?? { type: "AGENT", ownerId: null },
  );
  if (!before || loreDecision.mode === "none") {
    if (before && loreDecision.mode === "none") {
      console.warn(
        `[characters PATCH] denied user=${session.user.id} character=${id} reason=${loreDecision.reason}`,
      );
    }
    return NextResponse.json(
      { error: "캐릭터를 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  const playAllowed = canEditPlay(session.user.id, session.user.role, before);
  const isAdmin = loreDecision.mode === "admin";
  const isPlayer = loreDecision.mode === "player";

  /**
   * 쿨다운 enforcement (P6) — player 모드에만 적용.
   * admin 은 운영 책임 영역이라 별도 throttle 없음 (감사 로그로만 추적).
   */
  if (isPlayer) {
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

  const body = (await request.json()) as Record<string, unknown>;

  const reason =
    typeof body.reason === "string" ? body.reason.trim() || undefined : undefined;

  // dash → "미상" 정규화. POST 라우트와 일관된 정책 (모든 입력 경로에서 통일).
  // body.lore 가 partial object 이므로 partial schema 로 parse — transform 만 적용되고
  // 누락 필드는 그대로 통과. 형식 오류 시 400 (lore 검증 실패).
  if (body.lore && typeof body.lore === "object" && !Array.isArray(body.lore)) {
    const parsed = loreSheetSchema.partial().safeParse(body.lore);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "lore 형식 오류" },
        { status: 400 },
      );
    }
    body.lore = parsed.data;
  }

  // Phase 3+ — sub-document 별 화이트리스트 합성. admin 은 root + lore + play, player 는 lore 8필드.
  const allowedFields = new Set<string>();
  if (isAdmin) {
    for (const f of ROOT_ALLOWED_FIELDS_ADMIN) allowedFields.add(f);
    for (const f of ALLOWED_LORE_FIELDS_ADMIN) allowedFields.add(f);
    if (playAllowed) {
      for (const f of ALLOWED_PLAY_FIELDS_ADMIN) allowedFields.add(f);
    }
  } else {
    for (const f of ALLOWED_LORE_FIELDS_PLAYER) allowedFields.add(f);
    // play 는 player 에게 항상 차단 (canEditPlay → false). 화이트리스트 미포함 → 자동 drop.
  }

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
     */
    try {
      const updatedDoc = await findCharacterById(id);
      if (updatedDoc) {
        const changes = computeCharacterDiff(before, updatedDoc, allowedFields);
        if (changes.length > 0) {
          await insertChangeLog({
            characterId: new ObjectId(id),
            actorId: session.user.id,
            actorRole: session.user.role,
            actorIsOwner: before.ownerId === session.user.id,
            source: isAdmin ? "admin" : "player",
            changes,
            ...(reason ? { reason } : {}),
          });

          const displayName =
            session.user.displayName ||
            session.user.username ||
            `user-${session.user.id.slice(0, 6)}`;

          after(async () => {
            try {
              await notifyCharacterEdit({
                character: {
                  id,
                  codename: before.codename,
                  name: before.lore.name,
                },
                actor: {
                  id: session.user.id,
                  displayName,
                  role: session.user.role,
                },
                source: isAdmin ? "admin" : "player",
                actorIsOwner: before.ownerId === session.user.id,
                changes,
                reason,
                timestamp: new Date(),
              });
            } catch (webhookErr) {
              console.warn(
                `[characters PATCH] webhook scheduling failed user=${session.user.id} character=${id}:`,
                webhookErr,
              );
            }
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
