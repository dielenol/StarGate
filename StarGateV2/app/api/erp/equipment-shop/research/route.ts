/**
 * POST /api/erp/equipment-shop/research — 병기 연구소 스탯 강화.
 *
 * 1차 구현 정책:
 * - GM preview 단계이므로 GM 전용.
 * - personal: 요청자 메인 AGENT 1명에 영구 적용.
 * - team: 모든 AGENT 캐릭터에 영구 적용.
 * - 크레딧 차감/연구 재료 소모는 실제 밸런스 데이터 동기화 이후 연결한다.
 */

import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";

import { insertChangeLog } from "@stargate/shared-db";
import type { AgentCharacter, Character } from "@stargate/shared-db/types";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import {
  findMainCharacterByOwner,
  listAgentCharacters,
  updateCharacter,
} from "@/lib/db/characters";

const RESEARCH_SCOPES = ["personal", "team"] as const;
const RESEARCH_STATS = ["hp", "san", "def", "atk"] as const;
const MAX_RESEARCH_AMOUNT = 999;

type ResearchScope = (typeof RESEARCH_SCOPES)[number];
type ResearchStat = (typeof RESEARCH_STATS)[number];

interface ResearchBody {
  scope?: unknown;
  stat?: unknown;
  amount?: unknown;
  reason?: unknown;
}

interface ResearchTargetResult {
  id: string;
  codename: string;
  before: number;
  after: number;
}

function isResearchScope(value: unknown): value is ResearchScope {
  return (
    typeof value === "string" &&
    (RESEARCH_SCOPES as readonly string[]).includes(value)
  );
}

function isResearchStat(value: unknown): value is ResearchStat {
  return (
    typeof value === "string" &&
    (RESEARCH_STATS as readonly string[]).includes(value)
  );
}

function parseResearchAmount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < 1 || value > MAX_RESEARCH_AMOUNT) return null;
  return value;
}

function statLabel(stat: ResearchStat): string {
  return stat.toUpperCase();
}

function isAgentCharacter(character: Character): character is AgentCharacter {
  return character.type === "AGENT";
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requireRole(session.user.role, "GM");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as ResearchBody | null;
  const scope = body?.scope;
  const stat = body?.stat;
  const amount = parseResearchAmount(body?.amount);
  if (!isResearchScope(scope) || !isResearchStat(stat) || amount === null) {
    return NextResponse.json(
      {
        error:
          `연구 적용값이 올바르지 않습니다. scope=personal|team, ` +
          `stat=hp|san|def|atk, amount=1~${MAX_RESEARCH_AMOUNT} 정수여야 합니다.`,
        code: "INVALID_RESEARCH",
      },
      { status: 400 },
    );
  }

  const reason =
    typeof body?.reason === "string" && body.reason.trim()
      ? body.reason.trim()
      : `병기 연구소 ${scope === "team" ? "팀" : "개인"} 강화 — ${statLabel(stat)} +${amount}`;

  let targets: AgentCharacter[];
  try {
    targets =
      scope === "team"
        ? (await listAgentCharacters(null)).filter(isAgentCharacter)
        : await findMainCharacterByOwner(session.user.id).then((character) =>
            character && isAgentCharacter(character) ? [character] : [],
          );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "메인 캐릭터 조회 실패 (정합성 위반)";
    return NextResponse.json(
      { error: message, code: "MAIN_CHARACTER_INTEGRITY" },
      { status: 409 },
    );
  }

  if (targets.length === 0) {
    return NextResponse.json(
      {
        error:
          scope === "team"
            ? "강화를 적용할 AGENT 캐릭터가 없습니다."
            : "메인 AGENT 캐릭터가 등록되어 있지 않아 연구를 적용할 수 없습니다.",
        code: scope === "team" ? "NO_AGENT_TARGETS" : "NO_MAIN_CHARACTER",
      },
      { status: 400 },
    );
  }

  const allowedFields = new Set<string>([`play.${stat}`]);
  const results: ResearchTargetResult[] = [];
  let skipped = 0;
  let auditFailed = 0;

  for (const character of targets) {
    if (!character._id) {
      skipped += 1;
      continue;
    }

    const before = character.play[stat];
    if (!Number.isFinite(before)) {
      skipped += 1;
      continue;
    }
    const after = before + amount;
    const id = String(character._id);
    const updated = await updateCharacter(
      id,
      { play: { [stat]: after } },
      { allowedFields },
    );
    if (!updated) {
      skipped += 1;
      continue;
    }

    await insertChangeLog({
      characterId: new ObjectId(id),
      actorId: session.user.id,
      actorRole: session.user.role,
      actorIsOwner: character.ownerId === session.user.id,
      source: "admin",
      changes: [
        {
          field: `play.${stat}`,
          before,
          after,
        },
      ],
      reason,
      metadata: {
        source: "equipment_shop_research",
        scope,
        stat,
        amount,
      },
    }).catch((err) => {
      auditFailed += 1;
      console.warn(
        `[equipment-shop/research] audit insert failed character=${id} stat=${stat}:`,
        err,
      );
    });

    results.push({
      id,
      codename: character.codename,
      before,
      after,
    });
  }

  return NextResponse.json(
    {
      scope,
      stat,
      amount,
      affected: results.length,
      skipped,
      auditFailed,
      targets: results,
    },
    { status: 200, headers: { "Cache-Control": "private, no-store" } },
  );
}
