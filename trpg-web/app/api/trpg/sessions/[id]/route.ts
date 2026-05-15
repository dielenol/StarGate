/**
 * /api/trpg/sessions/[id]
 *
 * - PATCH: 세션 부분 갱신 (생성자 본인만)
 * - DELETE: 세션 취소 (soft delete, 생성자 본인만)
 *
 * shared-db 의 결과 union(updated/not-found/forbidden/not-open) 을 HTTP 상태 코드로 매핑.
 */

import "@/lib/db/init";

import { NextResponse } from "next/server";

import { z } from "zod";

import {
  cancelTrpgSession,
  findTrpgSessionById,
  isValidObjectId,
  listActiveTrpgGuildMembers,
  updateTrpgSession,
  updateTrpgSessionPatchSchema,
} from "@stargate/shared-db";

import { auth } from "@/lib/auth/config";
import { TRPG_GUILD_ID } from "@/lib/env";
import { toTrpgSessionView } from "@/lib/trpg/serializer";

const patchBodySchema = z.object({
  title: z.string().min(1).max(100).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  startTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
  participantDiscordIds: z.array(z.string().min(1).max(64)).max(50).optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  const requesterDiscordId = session?.user?.discordUserId;
  if (!session?.user || !requesterDiscordId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 JSON 본문" }, { status: 400 });
  }

  const parsed = patchBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "입력 검증 실패", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const patch = parsed.data;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "변경할 필드가 없습니다." },
      { status: 400 },
    );
  }

  const guildId = TRPG_GUILD_ID;

  const existing = await findTrpgSessionById(id);
  if (!existing) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (existing.createdByDiscordId !== requesterDiscordId) {
    return NextResponse.json(
      { error: "생성자만 수정할 수 있습니다." },
      { status: 403 },
    );
  }
  if (existing.status !== "open") {
    return NextResponse.json(
      { error: "이미 취소된 세션입니다." },
      { status: 409 },
    );
  }

  const sourceParticipantIds =
    patch.participantDiscordIds ?? existing.participantDiscordIds;
  const normalizedParticipantIds = Array.from(
    new Set([existing.createdByDiscordId, ...sourceParticipantIds]),
  );
  const shouldPatchParticipants =
    patch.participantDiscordIds !== undefined ||
    !existing.participantDiscordIds.includes(existing.createdByDiscordId);
  const normalizedPatch = shouldPatchParticipants
    ? { ...patch, participantDiscordIds: normalizedParticipantIds }
    : patch;

  if (shouldPatchParticipants) {
    const activeMembers = await listActiveTrpgGuildMembers(guildId);
    const activeIds = new Set(activeMembers.map((m) => m.discordUserId));
    const invalidIds = normalizedParticipantIds.filter(
      (pid) => !activeIds.has(pid),
    );
    if (invalidIds.length > 0) {
      return NextResponse.json(
        {
          error: "활성 길드 멤버가 아닌 참여자가 포함되어 있습니다.",
          invalidIds,
        },
        { status: 400 },
      );
    }
  }

  try {
    // shared-db 의 진입 검증 (DB 적재 직전 마지막 가드).
    const validatedPatch = updateTrpgSessionPatchSchema.parse(normalizedPatch);

    const result = await updateTrpgSession(id, requesterDiscordId, validatedPatch);

    switch (result.kind) {
      case "updated": {
        return NextResponse.json(toTrpgSessionView(result.session));
      }
      case "not-found":
        return NextResponse.json(
          { error: "Session not found" },
          { status: 404 },
        );
      case "forbidden":
        return NextResponse.json(
          { error: "생성자만 수정할 수 있습니다." },
          { status: 403 },
        );
      case "not-open":
        return NextResponse.json(
          { error: "이미 취소된 세션입니다." },
          { status: 409 },
        );
    }
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "스키마 검증 실패", details: err.flatten() },
        { status: 400 },
      );
    }
    const message = err instanceof Error ? err.message : "세션 갱신 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth();
  const requesterDiscordId = session?.user?.discordUserId;
  if (!session?.user || !requesterDiscordId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  try {
    const result = await cancelTrpgSession(id, requesterDiscordId);

    switch (result.kind) {
      case "cancelled":
        return NextResponse.json({ ok: true });
      case "not-found":
        return NextResponse.json(
          { error: "Session not found" },
          { status: 404 },
        );
      case "forbidden":
        return NextResponse.json(
          { error: "생성자만 취소할 수 있습니다." },
          { status: 403 },
        );
      case "already-cancelled":
        return NextResponse.json(
          { error: "이미 취소된 세션입니다." },
          { status: 409 },
        );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "세션 취소 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
