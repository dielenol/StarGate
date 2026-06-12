import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import { findMainCharacterLiteByOwner as findMainCharacterByOwner } from "@/lib/db/characters";
import { addCredit } from "@/lib/db/credits";
import {
  createFactionRelationLog,
  findFactionQuestProgress,
  listFactionQuestProgress,
  listFactionRelationLogs,
  setFactionQuestProgress,
  type FactionActivityKind,
  type FactionQuestProgressDoc,
  type FactionRelationLogDoc,
} from "@/lib/db/faction-activity";
import {
  getFactionFavorabilityOverride,
  setFactionFavorability,
} from "@/lib/db/faction-favorability";
import { findUserById } from "@/lib/db/users";

import { DEFAULT_FACTION_FAVORABILITY_BY_CODE } from "@/app/(erp)/erp/factions/_data";
import {
  FACTION_SUPPORT_OPTIONS,
  getFactionActionDelta,
  getFactionGameProfile,
  getFactionQuestCompletionDelta,
  getFactionSupportDelta,
} from "@/app/(erp)/erp/factions/_game";

const FAVORABILITY_MIN = -10;
const FAVORABILITY_MAX = 10;

const EDITABLE_FACTION_CODES = new Set([
  "COUNCIL",
  "MILITARY",
  "CIVIL",
  "HOSTILE",
  "WHITE_ROSE",
  "SPACE_ZERO",
  "GOLDEN_DAWN",
  "AHNENERBE",
  "NOVUS_ORDO",
  "SECRETARIAT",
  "MANUS",
]);

const HOSTILE_CODES = new Set(["HOSTILE", "GOLDEN_DAWN", "AHNENERBE"]);
const BRANCH_CODES = new Set(["WHITE_ROSE", "SPACE_ZERO"]);
const INTERNAL_CODES = new Set(["NOVUS_ORDO", "SECRETARIAT", "MANUS"]);

const SUPPORT_OPTIONS = new Map(
  FACTION_SUPPORT_OPTIONS.map((option) => [option.id, option] as const),
);

interface ActivityBody {
  type?: unknown;
  id?: unknown;
  label?: unknown;
  detail?: unknown;
}

interface ActivityRouteContext {
  params: Promise<{ code: string }>;
}

function normalizeCode(code: string) {
  return code.trim().toUpperCase();
}

function clampFavorability(value: number) {
  return Math.max(FAVORABILITY_MIN, Math.min(FAVORABILITY_MAX, value));
}

function kindForCode(code: string) {
  if (HOSTILE_CODES.has(code)) return "hostile";
  if (BRANCH_CODES.has(code)) return "branch";
  if (INTERNAL_CODES.has(code)) return "internal";
  return "external";
}

function compactText(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 220) : fallback;
}

function serializeLog(doc: FactionRelationLogDoc) {
  return {
    id: doc._id ? String(doc._id) : `${doc.code}-${doc.createdAt.toISOString()}`,
    code: doc.code,
    kind: doc.kind,
    title: doc.title,
    detail: doc.detail,
    delta: doc.delta,
    favorabilityBefore: doc.favorabilityBefore,
    favorabilityAfter: doc.favorabilityAfter,
    actorName: doc.actorName,
    createdAt: doc.createdAt.toISOString(),
    characterCodename: doc.characterCodename ?? null,
    creditCost: doc.creditCost ?? null,
    questId: doc.questId ?? null,
  };
}

function serializeQuestProgress(doc: FactionQuestProgressDoc) {
  return {
    id: doc._id ? String(doc._id) : `${doc.code}-${doc.questId}`,
    code: doc.code,
    questId: doc.questId,
    status: doc.status,
    title: doc.title,
    actorName: doc.actorName,
    startedAt: doc.startedAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    characterCodename: doc.characterCodename ?? null,
    completedAt: doc.completedAt?.toISOString() ?? null,
  };
}

async function getCurrentFavorability(code: string) {
  // 단일 코드만 필요 — 전체 override 컬렉션 fetch 대신 findOne.
  const override = await getFactionFavorabilityOverride(code);
  return override ?? DEFAULT_FACTION_FAVORABILITY_BY_CODE[code] ?? 0;
}

async function getSnapshot(code: string) {
  const [logs, questProgress] = await Promise.all([
    listFactionRelationLogs(code).catch(() => []),
    listFactionQuestProgress(code).catch(() => []),
  ]);

  return {
    logs: logs.map(serializeLog),
    questProgress: questProgress.map(serializeQuestProgress),
  };
}

export async function GET(_request: Request, context: ActivityRouteContext) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { code: rawCode } = await context.params;
  const code = normalizeCode(rawCode);
  if (!EDITABLE_FACTION_CODES.has(code)) {
    return NextResponse.json(
      { error: `unknown faction code: ${code || "(empty)"}` },
      { status: 400 },
    );
  }

  const snapshot = await getSnapshot(code);
  return NextResponse.json(snapshot);
}

export async function POST(request: Request, context: ActivityRouteContext) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requireRole(session.user.role, "GM");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { code: rawCode } = await context.params;
  const code = normalizeCode(rawCode);
  if (!EDITABLE_FACTION_CODES.has(code)) {
    return NextResponse.json(
      { error: `unknown faction code: ${code || "(empty)"}` },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => null)) as ActivityBody | null;
  if (!body || typeof body.id !== "string" || typeof body.type !== "string") {
    return NextResponse.json(
      { error: "type and id are required" },
      { status: 400 },
    );
  }

  const activityType = body.type as FactionActivityKind;
  const id = body.id.trim();
  const profile = getFactionGameProfile(code, kindForCode(code));
  const before = await getCurrentFavorability(code);
  let title = compactText(body.label, id);
  let detail = compactText(body.detail, "");
  let delta = 0;
  let creditCost: number | undefined;
  let characterId: string | undefined;
  let characterCodename: string | undefined;
  let creditTransactionId: string | undefined;
  let questProgress: FactionQuestProgressDoc | null = null;
  let mainChar: Awaited<ReturnType<typeof findMainCharacterByOwner>> | null =
    null;
  let mainCharacterLookupError: string | null = null;

  try {
    mainChar = await findMainCharacterByOwner(session.user.id);
  } catch (err) {
    mainCharacterLookupError =
      err instanceof Error ? err.message : "메인 캐릭터 조회에 실패했습니다.";
  }

  if (mainChar?._id) {
    characterId = String(mainChar._id);
    characterCodename = mainChar.codename;
  }

  if (activityType === "ACTION") {
    const action = profile.actions.find((entry) => entry.id === id);
    if (!action) {
      return NextResponse.json({ error: "unknown action id" }, { status: 400 });
    }
    title = action.label;
    detail = action.detail;
    delta = getFactionActionDelta(before);
  } else if (activityType === "SUPPORT") {
    const option = SUPPORT_OPTIONS.get(id);
    if (!option) {
      return NextResponse.json(
        { error: "unknown support id" },
        { status: 400 },
      );
    }

    if (mainCharacterLookupError) {
      return NextResponse.json(
        { error: mainCharacterLookupError, code: "MAIN_CHARACTER_INTEGRITY" },
        { status: 409 },
      );
    }

    if (!mainChar?.ownerId) {
      return NextResponse.json(
        {
          error:
            "크레딧을 차감할 메인 AGENT 캐릭터가 등록되어 있지 않습니다.",
          code: "NO_MAIN_CHARACTER",
        },
        { status: 400 },
      );
    }

    const owner = await findUserById(mainChar.ownerId);
    if (!owner) {
      return NextResponse.json(
        { error: "캐릭터 owner 정보를 찾을 수 없습니다." },
        { status: 500 },
      );
    }

    const ownerName = owner.discordUsername ?? owner.displayName;
    creditCost = option.amount;
    delta = getFactionSupportDelta(id, before);
    characterId = String(mainChar._id);
    characterCodename = mainChar.codename;

    try {
      const tx = await addCredit({
        characterId,
        characterCodename,
        ownerId: mainChar.ownerId,
        ownerName,
        amount: -creditCost,
        type: "PURCHASE",
        description: `세력 후원 · ${title}`,
        metadata: {
          factionCode: code,
          factionActivityType: activityType,
          factionActionId: id,
        },
        createdById: session.user.id,
        createdByName: session.user.displayName,
      });
      creditTransactionId = tx._id ? String(tx._id) : undefined;
    } catch (err) {
      const message =
        err instanceof Error && err.message.includes("addCredit:")
          ? "크레딧이 부족합니다."
          : err instanceof Error
            ? err.message
            : "크레딧 차감에 실패했습니다.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  } else if (
    activityType === "QUEST_ACCEPT" ||
    activityType === "QUEST_COMPLETE"
  ) {
    const quest = profile.quests.find((entry) => entry.id === id);
    if (!quest) {
      return NextResponse.json({ error: "unknown quest id" }, { status: 400 });
    }

    title = quest.title;
    detail = quest.summary;

    if (before < quest.minimumFavorability) {
      return NextResponse.json(
        { error: "favorability is too low for this quest" },
        { status: 400 },
      );
    }

    const existing = await findFactionQuestProgress(code, quest.id);
    if (activityType === "QUEST_ACCEPT") {
      if (existing?.status === "COMPLETED") {
        return NextResponse.json(
          { error: "quest is already completed" },
          { status: 400 },
        );
      }
      questProgress = await setFactionQuestProgress({
        code,
        questId: quest.id,
        status: "ACTIVE",
        title: quest.title,
        actorId: session.user.id,
        actorName: session.user.displayName,
        ...(characterId ? { characterId } : {}),
        ...(characterCodename ? { characterCodename } : {}),
      });
    } else {
      if (existing?.status !== "ACTIVE") {
        return NextResponse.json(
          { error: "quest must be active before completion" },
          { status: 400 },
        );
      }
      delta = getFactionQuestCompletionDelta(before);
      questProgress = await setFactionQuestProgress({
        code,
        questId: quest.id,
        status: "COMPLETED",
        title: quest.title,
        actorId: session.user.id,
        actorName: session.user.displayName,
        ...(characterId ? { characterId } : {}),
        ...(characterCodename ? { characterCodename } : {}),
      });
    }
  } else {
    return NextResponse.json(
      { error: "unknown activity type" },
      { status: 400 },
    );
  }

  const after = clampFavorability(before + delta);
  if (after !== before) {
    await setFactionFavorability({
      code,
      value: after,
      updatedById: session.user.id,
      updatedByName: session.user.displayName,
    });
  }

  await createFactionRelationLog({
    code,
    kind: activityType,
    title,
    detail,
    delta: after - before,
    favorabilityBefore: before,
    favorabilityAfter: after,
    actorId: session.user.id,
    actorName: session.user.displayName,
    ...(characterId ? { characterId } : {}),
    ...(characterCodename ? { characterCodename } : {}),
    ...(creditCost ? { creditCost } : {}),
    ...(creditTransactionId ? { creditTransactionId } : {}),
    ...(activityType.startsWith("QUEST") ? { questId: id } : {}),
  });

  const snapshot = await getSnapshot(code);
  return NextResponse.json({
    favorability: after,
    updatedQuestProgress: questProgress
      ? serializeQuestProgress(questProgress)
      : undefined,
    ...snapshot,
  });
}
