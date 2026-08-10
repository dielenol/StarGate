import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";

import {
  ALLOWED_LORE_FIELDS_ADMIN,
  ALLOWED_LORE_FIELDS_PLAYER,
  ALLOWED_PLAY_FIELDS_ADMIN,
  ALLOWED_PLAY_FIELDS_PLAYER,
  insertChangeLog,
  loreSheetSchema,
  playSheetSchema,
} from "@stargate/shared-db";

import { canViewCharacter } from "@/lib/auth/access-policy";
import { getActiveSession } from "@/lib/auth/active-session";
import {
  canEditLore,
  canEditPlay,
  isCharacterOwner,
  requireRole,
} from "@/lib/auth/rbac";
import { checkEditCooldown } from "@/lib/character/cooldown";
import { computeCharacterDiff } from "@/lib/character/diff";
import { ROOT_ALLOWED_FIELDS_ADMIN } from "@/lib/character/allowed-fields";
import { parseEditedSkillTrainingInput } from "@/lib/character/skill-training";
import {
  isExpectedUpdatedAtCurrent,
  parseExpectedUpdatedAt,
} from "@/lib/api/expected-updated-at";
import {
  findCharacterById,
  updateCharacter,
  deleteCharacter,
} from "@/lib/db/characters";
import { getClient } from "@/lib/db/client";
import { isValidObjectId } from "@/lib/db/utils";
import { scheduleGmAdminAudit } from "@/lib/notifications/gm-admin-audit";
import { enqueueCharacterEditWebhook } from "@/lib/outbox/integration";
import {
  filterCharacterForGuest,
  stripDossierPersonalityObservations,
} from "@/lib/personnel";
import { SessionReportInboundReferenceError } from "@/lib/db/session-reports";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await getActiveSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "잘못된 ID 형식입니다." }, { status: 400 });
  }

  try {
    const character = await findCharacterById(id);
    if (!character || !canViewCharacter(session.user.role, character)) {
      return NextResponse.json(
        { error: "캐릭터를 찾을 수 없습니다." },
        { status: 404 },
      );
    }
    const visibleCharacter = session.user.isGuest
      ? filterCharacterForGuest(character)
      : character;
    return NextResponse.json({
      character: stripDossierPersonalityObservations(visibleCharacter),
    });
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
/**
 * `clearanceOverrides` 객체 sanitize.
 *
 * - 유효 키: `FIELD_GROUP_ORDER` (`identity` / `profile` / `combatStats` / `abilities` / `meta`)
 * - 유효 값: `AGENT_LEVELS` 또는 `"GM"` (RoleLevel 전 8단)
 * - 잘못된 키/값은 silently drop — fallback 동작
 * - 결과가 빈 객체면 그대로 `{}` 반환 (DB 에 저장 → 모든 박스 fallback)
 */
function sanitizeClearanceOverrides(input: unknown): Record<string, string> | null {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const VALID_GROUPS = new Set<string>([
    "identity",
    "profile",
    "combatStats",
    "abilities",
    "meta",
  ]);
  const VALID_LEVELS = new Set<string>(["GM", "V", "A", "M", "H", "G", "J", "U"]);
  const source = input as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const key of Object.keys(source)) {
    if (!VALID_GROUPS.has(key)) continue;
    const v = source[key];
    if (typeof v !== "string" || !VALID_LEVELS.has(v)) continue;
    out[key] = v;
  }
  return out;
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getActiveSession();
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
  if (
    !before ||
    !canViewCharacter(session.user.role, before) ||
    loreDecision.mode === "none"
  ) {
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
  const actorIsOwner = isCharacterOwner(session.user.id, before);

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
  const expectedUpdatedAt = parseExpectedUpdatedAt(body);
  if (!expectedUpdatedAt.ok) {
    return NextResponse.json(
      { error: expectedUpdatedAt.error },
      { status: 400 },
    );
  }
  delete body.expectedUpdatedAt;
  if (
    !isExpectedUpdatedAtCurrent(before.updatedAt, expectedUpdatedAt.value)
  ) {
    return NextResponse.json(
      {
        error:
          "다른 사용자가 캐릭터를 수정했습니다. 최신본을 불러온 뒤 다시 시도하세요.",
        code: "STALE_VERSION",
      },
      { status: 409 },
    );
  }

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

  if (
    (playAllowed || isPlayer) &&
    body.play &&
    typeof body.play === "object" &&
    !Array.isArray(body.play) &&
    "abilities" in body.play
  ) {
    const play = body.play as Record<string, unknown>;
    const parsed = playSheetSchema.shape.abilities.safeParse(play.abilities);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "play.abilities 형식 오류 또는 중복 슬롯" },
        { status: 400 },
      );
    }
    play.abilities = parsed.data;
  }

  if (
    (playAllowed || isPlayer) &&
    body.play &&
    typeof body.play === "object" &&
    !Array.isArray(body.play) &&
    "skillTraining" in body.play
  ) {
    const play = body.play as Record<string, unknown>;
    const existingSkillTraining =
      before.type === "AGENT" ? before.play.skillTraining : [];
    const parsed = parseEditedSkillTrainingInput(
      play.skillTraining,
      existingSkillTraining,
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: "play.skillTraining은 문자열 배열이어야 합니다." },
        { status: 400 },
      );
    }
    play.skillTraining = parsed.data;
  }

  // clearanceOverrides 는 admin 만 갱신 가능. 유효 FieldGroup × RoleLevel 쌍으로 제한.
  // body 에 존재하면 sanitize 결과로 교체 (잘못된 키/값 silently drop).
  // 빈 객체({}) 는 그대로 저장 → 모든 박스 fallback 동작.
  if (isAdmin && "clearanceOverrides" in body) {
    const sanitized = sanitizeClearanceOverrides(body.clearanceOverrides);
    if (sanitized === null) {
      // null/배열/원시값 같은 잘못된 타입은 silently drop.
      delete body.clearanceOverrides;
    } else {
      body.clearanceOverrides = sanitized;
    }
  }

  // Phase 3+ — sub-document 별 화이트리스트 합성. admin 은 root + lore + play, player 는 안전한 lore/play 자가편집 필드.
  const allowedFields = new Set<string>();
  if (isAdmin) {
    for (const f of ROOT_ALLOWED_FIELDS_ADMIN) allowedFields.add(f);
    for (const f of ALLOWED_LORE_FIELDS_ADMIN) allowedFields.add(f);
    if (playAllowed) {
      for (const f of ALLOWED_PLAY_FIELDS_ADMIN) allowedFields.add(f);
    }
  } else {
    for (const f of ALLOWED_LORE_FIELDS_PLAYER) allowedFields.add(f);
    for (const f of ALLOWED_PLAY_FIELDS_PLAYER) allowedFields.add(f);
  }

  try {
    const client = await getClient();
    const dbSession = client.startSession();
    let current: Awaited<ReturnType<typeof findCharacterById>> = null;
    try {
      current = await dbSession.withTransaction(async () => {
        const updated = await updateCharacter(id, body, {
          allowedFields,
          expectedUpdatedAt: expectedUpdatedAt.value,
          session: dbSession,
        });
        if (!updated) return null;
        const next = await findCharacterById(id, { session: dbSession });
        if (!next) {
          throw new Error("수정된 캐릭터를 트랜잭션 안에서 확인하지 못했습니다.");
        }
        const changes = computeCharacterDiff(before, next, allowedFields);
        if (changes.length === 0) return next;
        await insertChangeLog({
          characterId: new ObjectId(id),
          actorId: session.user.id,
          actorRole: session.user.role,
          actorIsOwner,
          source: isAdmin ? "admin" : "player",
          changes,
          ...(reason ? { reason } : {}),
        }, { session: dbSession });

        const displayName =
          session.user.displayName ||
          session.user.username ||
          `user-${session.user.id.slice(0, 6)}`;
        await enqueueCharacterEditWebhook({
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
          actorIsOwner,
          changes,
          reason,
          timestamp: new Date(),
        }, undefined, { session: dbSession });
        return next;
      });
    } finally {
      await dbSession.endSession();
    }
    if (!current) {
      const latest = await findCharacterById(id);
      if (
        latest &&
        !isExpectedUpdatedAtCurrent(
          latest.updatedAt,
          expectedUpdatedAt.value,
        )
      ) {
        return NextResponse.json(
          {
            error:
              "다른 사용자가 캐릭터를 수정했습니다. 최신본을 불러온 뒤 다시 시도하세요.",
            code: "STALE_VERSION",
          },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { error: "캐릭터를 찾을 수 없거나 변경 사항이 없습니다." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      updatedAt: current.updatedAt.toISOString(),
    });
  } catch (err) {
    if (err instanceof SessionReportInboundReferenceError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : "캐릭터 수정 실패";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await getActiveSession();
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
    const target = await findCharacterById(id);
    if (!target) {
      return NextResponse.json(
        { error: "캐릭터를 찾을 수 없습니다." },
        { status: 404 },
      );
    }
    const client = await getClient();
    const dbSession = client.startSession();
    let deleted = false;
    try {
      await dbSession.withTransaction(async () => {
        deleted = await deleteCharacter(id, { session: dbSession });
        if (!deleted) return;
        await scheduleGmAdminAudit({
          action: "캐릭터 삭제",
          actor: {
            id: session.user.id,
            displayName: session.user.displayName,
            role: session.user.role,
          },
          summary: `${target.type} 캐릭터 영구 삭제`,
          target: `${target.codename} · ${target.lore.name}`,
          timestamp: new Date(),
        }, { session: dbSession });
      });
    } finally {
      await dbSession.endSession();
    }
    if (!deleted) {
      return NextResponse.json(
        { error: "캐릭터를 찾을 수 없습니다." },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof SessionReportInboundReferenceError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : "캐릭터 삭제 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
