import {
  BUREAUCRAT_VOTE_CHANNEL_ID,
  createBureaucratVote,
} from "@stargate/shared-db";
import { NextResponse } from "next/server";

import { getActiveSession } from "@/lib/auth/active-session";
import { hasRole } from "@/lib/auth/rbac";
import {
  BUREAUCRAT_VOTE_PRESETS,
  findBureaucratVotePreset,
} from "@/lib/bureaucrat-votes/presets";
import { readIdempotencyKey } from "@/lib/api/idempotency";
import {
  getSerializedBureaucratVotes,
  serializeBureaucratVote,
} from "@/lib/db/bureaucrat-votes";

async function requireGm() {
  const session = await getActiveSession();
  if (!session?.user) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    } as const;
  }
  if (!hasRole(session.user.role, "GM")) {
    return {
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    } as const;
  }
  return { user: session.user } as const;
}

function responsePayload(votes: Awaited<ReturnType<typeof getSerializedBureaucratVotes>>) {
  const guildId = process.env.GUILD_ID?.trim() || null;
  return {
    configured: guildId !== null,
    discordGuildId: guildId,
    discordChannelId: BUREAUCRAT_VOTE_CHANNEL_ID,
    durationHours: 6 as const,
    presets: BUREAUCRAT_VOTE_PRESETS,
    votes,
  };
}

export async function GET() {
  const auth = await requireGm();
  if ("response" in auth) return auth.response;
  return NextResponse.json(responsePayload(await getSerializedBureaucratVotes()), {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: Request) {
  const auth = await requireGm();
  if ("response" in auth) return auth.response;
  const idempotencyKey = readIdempotencyKey(request);
  if (!idempotencyKey) {
    return NextResponse.json(
      { error: "유효한 Idempotency-Key 헤더가 필요합니다." },
      { status: 400 },
    );
  }
  const guildId = process.env.GUILD_ID?.trim();
  if (!guildId) {
    return NextResponse.json(
      { error: "GUILD_ID가 설정되지 않아 관료 표결을 등재할 수 없습니다." },
      { status: 503 },
    );
  }
  const body = (await request.json().catch(() => null)) as
    | { presetKey?: unknown }
    | null;
  const presetKey = typeof body?.presetKey === "string"
    ? body.presetKey.trim()
    : "";
  const preset = findBureaucratVotePreset(presetKey);
  if (!preset) {
    return NextResponse.json({ error: "등록되지 않은 관료 표결 안건입니다." }, { status: 400 });
  }

  const result = await createBureaucratVote({
    requestKey: `erp:${guildId}:${idempotencyKey}`,
    source: "ERP_PRESET",
    presetKey: preset.key,
    guildId,
    title: preset.title,
    content: preset.content,
    createdBy: {
      kind: "ERP_USER",
      id: auth.user.id,
      displayName: auth.user.displayName,
    },
  });
  if (
    result.vote.source !== "ERP_PRESET" ||
    result.vote.presetKey !== preset.key ||
    result.vote.guildId !== guildId
  ) {
    return NextResponse.json(
      { error: "같은 Idempotency-Key가 다른 안건에 사용되었습니다." },
      { status: 409 },
    );
  }
  if (result.conflict === "ACTIVE_PRESET") {
    return NextResponse.json(
      {
        error: "같은 안건의 진행 중 표결이 이미 있습니다.",
        code: "ACTIVE_VOTE_EXISTS",
        vote: serializeBureaucratVote(result.vote),
      },
      { status: 409 },
    );
  }
  return NextResponse.json(
    { vote: serializeBureaucratVote(result.vote), created: result.created },
    { status: result.created ? 202 : 200 },
  );
}
