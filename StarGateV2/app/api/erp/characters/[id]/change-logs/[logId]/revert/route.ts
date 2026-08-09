/**
 * POST /api/erp/characters/[id]/change-logs/[logId]/revert  (P8)
 *
 * GM 전용 — 특정 change log 를 되돌린다 (해당 변경 직전 값으로 캐릭터 복원).
 *
 * 흐름:
 *   1. auth() — 미인증 401
 *   2. requireRole(GM) — GM 미만 403
 *   3. id / logId 검증 — 잘못된 형식 400
 *   4. getChangeLogById — 미존재 404
 *   5. log.characterId 와 path id 불일치 — 400 (path mismatch)
 *   6. log.revertedAt 이미 있음 — 409 (멱등 가드)
 *   7. log.changes 의 (field, before) 쌍을 부분 객체 revertBody 로 변환
 *   8. 하나의 Mongo transaction 안에서 캐릭터 복원, 새 audit log,
 *      원본 log의 reverted 표식, character webhook outbox를 함께 commit
 *   9. race로 원본 log를 먼저 되돌린 요청은 409
 *  10. 200
 */

import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";

import {
  ALLOWED_LORE_FIELDS_ADMIN,
  ALLOWED_PLAY_FIELDS_ADMIN,
  getChangeLogById,
  insertChangeLog,
  markChangeLogReverted,
} from "@stargate/shared-db";

import { auth } from "@/lib/auth/config";
import { isCharacterOwner, requireRole } from "@/lib/auth/rbac";
import { ROOT_ALLOWED_FIELDS_ADMIN } from "@/lib/character/allowed-fields";
import { computeCharacterDiff } from "@/lib/character/diff";
import {
  areChangeLogAfterValuesCurrent,
  changesToRevertFieldPatch,
} from "@/lib/character/revert";
import {
  applyCharacterFieldPatch,
  findCharacterById,
} from "@/lib/db/characters";
import { getClient } from "@/lib/db/client";
import { isValidObjectId } from "@/lib/db/utils";
import { enqueueCharacterEditWebhook } from "@/lib/outbox/integration";

interface RouteContext {
  params: Promise<{ id: string; logId: string }>;
}

class ChangeLogAlreadyRevertedError extends Error {}
class StaleChangeLogRevertError extends Error {}

export async function POST(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // GM only — V+ 가 아닌 더 엄격한 게이트. PATCH 는 V+, revert 는 GM 전용.
  try {
    requireRole(session.user.role, "GM");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, logId } = await context.params;
  if (!isValidObjectId(id) || !isValidObjectId(logId)) {
    return NextResponse.json({ error: "잘못된 ID 형식입니다." }, { status: 400 });
  }

  // 1. 로그 조회
  const log = await getChangeLogById(logId);
  if (!log) {
    return NextResponse.json(
      { error: "변경 로그를 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  // 2. characterId path mismatch — URL 위변조 방지 (다른 캐릭터 path 로 다른 로그 revert 시도)
  if (log.characterId.toString() !== id) {
    return NextResponse.json(
      { error: "로그가 해당 캐릭터에 속하지 않습니다." },
      { status: 400 },
    );
  }

  // 3. 이미 revert 된 로그 — 409 conflict (멱등 가드, race 도 markChangeLogReverted 가 추가 보호)
  if (log.revertedAt) {
    return NextResponse.json(
      { error: "이미 되돌려진 로그입니다." },
      { status: 409 },
    );
  }

  const before = await findCharacterById(id);
  if (!before) {
    // 캐릭터 자체가 삭제된 경우 — revert 불가
    return NextResponse.json(
      { error: "캐릭터를 찾을 수 없습니다." },
      { status: 404 },
    );
  }
  /**
   * revert 화이트리스트 — admin 권한자(GM)이 수행하는 복원이므로 root 메타 + lore + play
   * 모두 허용. PATCH 라우트와 동일하게 root 필드를 명시적으로 추가.
   */
  const revertAllowedFields = new Set<string>();
  for (const f of ROOT_ALLOWED_FIELDS_ADMIN) revertAllowedFields.add(f);
  for (const f of ALLOWED_LORE_FIELDS_ADMIN) revertAllowedFields.add(f);
  for (const f of ALLOWED_PLAY_FIELDS_ADMIN) revertAllowedFields.add(f);

  try {
    let revertChanges: ReturnType<typeof computeCharacterDiff> = [];
    const client = await getClient();
    const dbSession = client.startSession();
    try {
      await dbSession.withTransaction(async () => {
        const currentLog = await getChangeLogById(logId, {
          session: dbSession,
        });
        if (!currentLog || currentLog.revertedAt) {
          throw new ChangeLogAlreadyRevertedError();
        }
        const transactionalBefore = await findCharacterById(id, {
          session: dbSession,
        });
        if (!transactionalBefore) {
          throw new Error("캐릭터를 찾을 수 없습니다.");
        }
        if (
          !areChangeLogAfterValuesCurrent(
            transactionalBefore,
            currentLog.changes,
          )
        ) {
          throw new StaleChangeLogRevertError();
        }
        const transactionalActorIsOwner = isCharacterOwner(
          session.user.id,
          transactionalBefore,
        );
        const updated = await applyCharacterFieldPatch(
          id,
          changesToRevertFieldPatch(currentLog.changes),
          {
            allowedFields: revertAllowedFields,
            session: dbSession,
          },
        );
        if (!updated) {
          throw new Error("되돌릴 수 있는 변경 필드가 없습니다.");
        }
        const updatedDoc = await findCharacterById(id, {
          session: dbSession,
        });
        if (!updatedDoc) {
          throw new Error("되돌린 캐릭터를 확인하지 못했습니다.");
        }
        revertChanges = computeCharacterDiff(
          transactionalBefore,
          updatedDoc,
          revertAllowedFields,
        );
        if (revertChanges.length === 0) {
          throw new Error("되돌릴 실제 변경이 없습니다.");
        }
        await insertChangeLog({
          characterId: new ObjectId(id),
          actorId: session.user.id,
          actorRole: session.user.role,
          actorIsOwner: transactionalActorIsOwner,
          source: "admin",
          changes: revertChanges,
          reason: `revert:${logId}`,
        }, { session: dbSession });

        const marked = await markChangeLogReverted(logId, session.user.id, {
          session: dbSession,
        });
        if (!marked) throw new ChangeLogAlreadyRevertedError();

        if (revertChanges.length > 0) {
          const displayName =
            session.user.displayName ||
            session.user.username ||
            `user-${session.user.id.slice(0, 6)}`;
          await enqueueCharacterEditWebhook(
            {
              character: {
                id,
                codename: transactionalBefore.codename,
                name: transactionalBefore.lore.name,
              },
              actor: {
                id: session.user.id,
                displayName,
                role: session.user.role,
              },
              source: "admin",
              actorIsOwner: transactionalActorIsOwner,
              changes: revertChanges,
              reason: `revert:${logId}`,
              timestamp: new Date(),
            },
            `revert:${logId}`,
            { session: dbSession },
          );
        }
      });
    } finally {
      await dbSession.endSession();
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ChangeLogAlreadyRevertedError) {
      return NextResponse.json(
        { error: "이미 되돌려진 로그입니다." },
        { status: 409 },
      );
    }
    if (err instanceof StaleChangeLogRevertError) {
      return NextResponse.json(
        {
          error: "이 로그 이후 같은 필드가 변경되어 되돌릴 수 없습니다.",
          code: "STALE_REVERT",
        },
        { status: 409 },
      );
    }
    const message = err instanceof Error ? err.message : "되돌리기 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
