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
 *   8. updateCharacter(id, revertBody, ADMIN 화이트리스트) — 성공 시 새 audit log 기록
 *      (revert 의 결과로 다시 변경이 일어나므로 revert 자체도 변경 이력에 남김)
 *   9. markChangeLogReverted(logId, GM) — 멱등성으로 race 시 null 반환 가능 (silent OK)
 *  10. P7 notifyCharacterEdit fire-and-forget (after())
 *  11. 200
 *
 * 트랜잭션 정책: 미사용 (전체 P 시리즈 정책). updateCharacter 성공 후 audit insert /
 *   markChangeLogReverted 가 실패해도 사용자 응답에는 영향 X — try/catch 로 격리.
 */

import { ObjectId } from "mongodb";
import { NextResponse, after } from "next/server";

import {
  ADMIN_ALLOWED_CHARACTER_FIELDS,
  getChangeLogById,
  insertChangeLog,
  markChangeLogReverted,
} from "@stargate/shared-db";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import { computeCharacterDiff } from "@/lib/character/diff";
import { changesToRevertBody } from "@/lib/character/revert";
import { findCharacterById, updateCharacter } from "@/lib/db/characters";
import { isValidObjectId } from "@/lib/db/utils";
import { notifyCharacterEdit } from "@/lib/discord";

interface RouteContext {
  params: Promise<{ id: string; logId: string }>;
}

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

  // 4. revert body 빌드 — dot path 를 부분 객체로 풀고 ADMIN 화이트리스트로 가드
  const revertBody = changesToRevertBody(log.changes);

  const before = await findCharacterById(id);
  if (!before) {
    // 캐릭터 자체가 삭제된 경우 — revert 불가
    return NextResponse.json(
      { error: "캐릭터를 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  try {
    const updated = await updateCharacter(id, revertBody, {
      allowedFields: ADMIN_ALLOWED_CHARACTER_FIELDS,
    });
    if (!updated) {
      // 변경 사항이 없거나 (이미 before 값과 동일) ID 미스매치
      return NextResponse.json(
        { error: "되돌릴 변경 사항이 없습니다." },
        { status: 409 },
      );
    }

    /**
     * revert 자체를 새 audit log 로 기록.
     * 트랜잭션 미사용이라 update 성공 후 best-effort 로 별도 insert. 실패해도 사용자
     * 응답에는 영향 주지 않고 console.warn 만 남김.
     */
    let revertChanges: ReturnType<typeof computeCharacterDiff> = [];
    try {
      const updatedDoc = await findCharacterById(id);
      if (updatedDoc) {
        revertChanges = computeCharacterDiff(
          before,
          updatedDoc,
          ADMIN_ALLOWED_CHARACTER_FIELDS,
        );
        if (revertChanges.length > 0) {
          await insertChangeLog({
            characterId: new ObjectId(id),
            actorId: session.user.id,
            actorRole: session.user.role,
            actorIsOwner: before.ownerId === session.user.id,
            source: "admin",
            changes: revertChanges,
            reason: `revert:${logId}`,
          });
        }
      }
    } catch (auditErr) {
      console.warn(
        `[revert POST] audit insert failed user=${session.user.id} character=${id} log=${logId}:`,
        auditErr,
      );
    }

    /**
     * 원본 로그를 revert 상태로 마킹. shared-db 의 markChangeLogReverted 는 멱등 —
     * 이미 revertedAt 가 있으면 null 반환 (race 케이스). null 반환은 silent OK.
     */
    try {
      await markChangeLogReverted(logId, session.user.id);
    } catch (markErr) {
      console.warn(
        `[revert POST] mark revert failed user=${session.user.id} log=${logId}:`,
        markErr,
      );
    }

    /**
     * P7 디스코드 GM 채널 알림 — fire-and-forget. 응답 시간/UX 영향 0.
     * revert 도 admin 편집의 일종으로 간주 (source: 'admin', reason: 'revert:{logId}').
     */
    if (revertChanges.length > 0) {
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
              name: before.sheet.name,
            },
            actor: {
              id: session.user.id,
              displayName,
              role: session.user.role,
            },
            source: "admin",
            actorIsOwner: before.ownerId === session.user.id,
            changes: revertChanges,
            reason: `revert:${logId}`,
            timestamp: new Date(),
          });
        } catch (webhookErr) {
          console.warn(
            `[revert POST] webhook scheduling failed log=${logId}:`,
            webhookErr,
          );
        }
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "되돌리기 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
