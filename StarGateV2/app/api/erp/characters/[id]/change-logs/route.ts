/**
 * GET /api/erp/characters/[id]/change-logs  (P8)
 *
 * 캐릭터 변경 이력 조회. GM 또는 본인(소유자) 만 접근.
 *
 * 권한 매트릭스:
 *   - GM (V+ 가 아니라 GM 한정) : 모든 캐릭터의 이력 조회 + revertable=true
 *   - 본인(ownerId === sessionUserId) : 자신의 캐릭터 이력만 readonly (revertable=false)
 *   - 그 외 : 통합 404 (existence oracle 차단 — `/edit-quota` 와 동일 패턴)
 *
 * 페이지네이션:
 *   - query param: limit (기본 20, 최대 100), skip (기본 0)
 *   - 응답: { items, hasMore, limit, skip }
 *   - hasMore: 이번 페이지가 limit 와 같은 길이로 채워지면 true
 *
 * actor displayName 보강:
 *   - 각 row 가 actorId 를 들고 있고 UI 는 username/displayName 을 보여줘야 함.
 *   - actorId 셋을 모은 뒤 DB 한 번에 조회해 매핑 (item 당 1회 findUserById 회피).
 *   - revertedBy 의 displayName 도 같은 셋에 합류시켜 한 번의 조회로 해결.
 */

import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";

import {
  listChangeLogsByCharacter,
  usersCol,
} from "@stargate/shared-db";
import type { User } from "@stargate/shared-db";

import { auth } from "@/lib/auth/config";
import { canEditCharacter, hasRole } from "@/lib/auth/rbac";
import { findCharacterById } from "@/lib/db/characters";
import { isValidObjectId } from "@/lib/db/utils";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function parsePositiveInt(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

export async function GET(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "잘못된 ID 형식입니다." }, { status: 400 });
  }

  const character = await findCharacterById(id);

  /**
   * 권한 결정. GM 이면 모든 캐릭터 OK. 그 외에는 본인(ownerId 일치) 만.
   * canEditCharacter 의 'admin' 모드는 V+ 까지 — 여기서는 더 엄격한 GM 게이트가 필요해서
   * hasRole(GM) 별도 체크. 본인 케이스는 canEditCharacter 의 'player' 모드 활용.
   */
  const decision = canEditCharacter(
    session.user.id,
    session.user.role,
    character ?? { ownerId: null },
  );
  const isGm = hasRole(session.user.role, "GM");
  const isOwner = decision.mode === "player";

  if (!character || (!isGm && !isOwner)) {
    if (character && !isGm && !isOwner) {
      console.warn(
        `[change-logs GET] denied user=${session.user.id} character=${id} role=${session.user.role}`,
      );
    }
    return NextResponse.json(
      { error: "캐릭터를 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  const url = new URL(request.url);
  const limit = Math.min(
    MAX_LIMIT,
    parsePositiveInt(url.searchParams.get("limit"), DEFAULT_LIMIT) ||
      DEFAULT_LIMIT,
  );
  const skip = parsePositiveInt(url.searchParams.get("skip"), 0);

  // limit + 1 로 끌어서 hasMore 판정. 응답에는 limit 만큼만 노출.
  const fetched = await listChangeLogsByCharacter(id, {
    limit: limit + 1,
    skip,
  });
  const hasMore = fetched.length > limit;
  const slice = fetched.slice(0, limit);

  // actor + revertedBy displayName 일괄 조회 (item 당 1회 X — DB 한 번 호출).
  const actorIdSet = new Set<string>();
  for (const log of slice) {
    if (log.actorId) actorIdSet.add(log.actorId);
    if (log.revertedBy) actorIdSet.add(log.revertedBy);
  }
  const actorMap = new Map<string, { displayName: string; username: string }>();
  if (actorIdSet.size > 0) {
    const objectIds = [...actorIdSet]
      .filter((id) => ObjectId.isValid(id))
      .map((id) => new ObjectId(id));
    if (objectIds.length > 0) {
      const col = await usersCol();
      const users = (await col
        .find({ _id: { $in: objectIds } })
        .project<Pick<User, "_id" | "displayName" | "username">>({
          displayName: 1,
          username: 1,
        })
        .toArray()) as Array<Pick<User, "_id" | "displayName" | "username">>;
      for (const u of users) {
        if (!u._id) continue;
        actorMap.set(u._id.toString(), {
          displayName: u.displayName,
          username: u.username,
        });
      }
    }
  }

  function lookup(actorId: string | null | undefined) {
    if (!actorId) return null;
    const u = actorMap.get(actorId);
    if (!u) {
      // 사용자가 삭제된 경우 — actorId 의 첫 6자로 anonymize
      return {
        displayName: `user-${actorId.slice(0, 6)}`,
        username: null,
      };
    }
    return { displayName: u.displayName, username: u.username };
  }

  // GM 이면 revertable, owner 본인은 readonly.
  const items = slice.map((log) => {
    const actor = lookup(log.actorId);
    const reverted = lookup(log.revertedBy ?? null);
    const revertable = isGm && !log.revertedAt;
    return {
      _id: log._id.toString(),
      characterId: log.characterId.toString(),
      actorId: log.actorId,
      actorRole: log.actorRole,
      actorIsOwner: log.actorIsOwner,
      actorDisplayName: actor?.displayName ?? null,
      actorUsername: actor?.username ?? null,
      source: log.source,
      changes: log.changes,
      reason: log.reason ?? null,
      createdAt: log.createdAt.toISOString(),
      revertedAt: log.revertedAt ? log.revertedAt.toISOString() : null,
      revertedBy: log.revertedBy ?? null,
      revertedByDisplayName: reverted?.displayName ?? null,
      revertable,
    };
  });

  return NextResponse.json(
    {
      items,
      hasMore,
      limit,
      skip,
      viewerIsGm: isGm,
    },
    {
      // 사용자별/시간별로 변동되는 데이터 — CDN/브라우저 양쪽 캐시 금지.
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}
