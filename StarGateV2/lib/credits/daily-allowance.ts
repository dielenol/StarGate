import { MongoServerError } from "mongodb";

import type { AgentCharacter, AgentLevel, Character } from "@/types/character";
import type { CreditTransaction } from "@/types/credit";

import { AGENT_LEVELS } from "@/types/character";

import "@/lib/db/init";

import { creditTransactionsCol } from "@stargate/shared-db";

import { listAgentCharacters } from "@/lib/db/characters";
import { addCredit } from "@/lib/db/credits";
import { SYSTEM_USER_ID_SENTINEL } from "@/lib/db/system-actor";
import { findUsersByIds } from "@/lib/db/users";
import { kstDateTag } from "@/lib/stocks/time";

type PayableAgentLevel = (typeof AGENT_LEVELS)[number];

export const DAILY_ALLOWANCE_BY_AGENT_LEVEL = {
  V: 45,
  A: 38,
  M: 32,
  H: 27,
  G: 23,
  J: 18,
  U: 10,
} as const satisfies Record<PayableAgentLevel, number>;

const DAILY_ALLOWANCE_ACTOR_NAME = "NOVUS ORDO 재무기구";
const DAILY_ALLOWANCE_POLICY_VERSION = "daily-allowance-2026-07-v1";
const DAILY_ALLOWANCE_INDEX_NAME =
  "credit_transactions_dailyAllowance_unique";

type DailyCreditAllowanceStatus =
  | "granted"
  | "skipped-already-paid"
  | "skipped-ineligible-level"
  | "skipped-no-owner"
  | "skipped-owner-not-found"
  | "failed";

export interface DailyCreditAllowanceResult {
  characterId: string;
  characterCodename: string;
  agentLevel: AgentLevel | null;
  amount: number;
  status: DailyCreditAllowanceStatus;
  transactionId?: string;
  balance?: number;
  error?: string;
}

export interface DailyCreditAllowanceSummary {
  date: string;
  policyVersion: string;
  totalCandidates: number;
  granted: number;
  skipped: number;
  failed: number;
  totalAmount: number;
  results: DailyCreditAllowanceResult[];
}

let dailyAllowanceIndexPromise: Promise<string> | null = null;

function ensureDailyAllowanceIndex(): Promise<string> {
  dailyAllowanceIndexPromise ??= creditTransactionsCol().then((col) =>
    col.createIndex(
      { "metadata.dailyAllowanceDate": 1, characterId: 1 },
      {
        name: DAILY_ALLOWANCE_INDEX_NAME,
        unique: true,
        partialFilterExpression: { "metadata.dailyAllowance": true },
      },
    ),
  );
  return dailyAllowanceIndexPromise;
}

function isPayableAgentLevel(
  level: AgentLevel | undefined,
): level is PayableAgentLevel {
  return (
    typeof level === "string" &&
    (AGENT_LEVELS as readonly string[]).includes(level)
  );
}

function getDailyAllowanceAmount(level: AgentLevel | undefined): number | null {
  if (!isPayableAgentLevel(level)) return null;
  return DAILY_ALLOWANCE_BY_AGENT_LEVEL[level];
}

function ownerDisplayName(owner: {
  discordUsername?: string | null;
  displayName?: string | null;
}): string {
  return (
    owner.discordUsername ?? owner.displayName ?? DAILY_ALLOWANCE_ACTOR_NAME
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isDuplicateDailyAllowanceError(error: unknown): boolean {
  return (
    error instanceof MongoServerError &&
    error.code === 11_000 &&
    String(error.message).includes(DAILY_ALLOWANCE_INDEX_NAME)
  );
}

async function listAlreadyPaidCharacterIds(date: string): Promise<Set<string>> {
  const col = await creditTransactionsCol();
  const rows = await col
    .find({
      "metadata.dailyAllowance": true,
      "metadata.dailyAllowanceDate": date,
    })
    .project<Pick<CreditTransaction, "characterId">>({ characterId: 1 })
    .toArray();

  return new Set(rows.map((row) => row.characterId));
}

function isOperationalMainAgent(character: Character): character is AgentCharacter {
  return character.type === "AGENT" && character.isPublic !== false;
}

function resultForSkipped(
  character: AgentCharacter,
  status: Exclude<DailyCreditAllowanceStatus, "granted" | "failed">,
  amount = 0,
): DailyCreditAllowanceResult {
  return {
    characterId: String(character._id),
    characterCodename: character.codename,
    agentLevel: character.agentLevel ?? null,
    amount,
    status,
  };
}

export async function grantDailyCreditAllowances(
  now: Date = new Date(),
): Promise<DailyCreditAllowanceSummary> {
  const date = kstDateTag(now);
  await ensureDailyAllowanceIndex();
  const [characters, alreadyPaid] = await Promise.all([
    listAgentCharacters("MAIN"),
    listAlreadyPaidCharacterIds(date),
  ]);

  const candidates = characters.filter(isOperationalMainAgent);
  const ownerIds = Array.from(
    new Set(
      candidates
        .map((character) => character.ownerId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );
  const owners = await findUsersByIds(ownerIds);
  const ownerById = new Map(owners.map((owner) => [String(owner._id), owner]));

  const results: DailyCreditAllowanceResult[] = [];

  for (const character of candidates) {
    const characterId = String(character._id);
    const amount = getDailyAllowanceAmount(character.agentLevel);

    if (amount === null) {
      results.push(resultForSkipped(character, "skipped-ineligible-level"));
      continue;
    }

    if (alreadyPaid.has(characterId)) {
      results.push(resultForSkipped(character, "skipped-already-paid", amount));
      continue;
    }

    if (!character.ownerId) {
      results.push(resultForSkipped(character, "skipped-no-owner", amount));
      continue;
    }

    const owner = ownerById.get(character.ownerId);
    if (!owner) {
      results.push(
        resultForSkipped(character, "skipped-owner-not-found", amount),
      );
      continue;
    }

    try {
      const transaction = await addCredit({
        characterId,
        characterCodename: character.codename,
        ownerId: character.ownerId,
        ownerName: ownerDisplayName(owner),
        amount,
        type: "DAILY_ALLOWANCE",
        description: `재무기구 일일 직급 수당 — ${date}`,
        createdById: SYSTEM_USER_ID_SENTINEL,
        createdByName: DAILY_ALLOWANCE_ACTOR_NAME,
        allowNegative: false,
        metadata: {
          dailyAllowance: true,
          dailyAllowanceDate: date,
          agentLevel: character.agentLevel ?? null,
          policyVersion: DAILY_ALLOWANCE_POLICY_VERSION,
          source: "finance-cron",
        },
      });

      results.push({
        characterId,
        characterCodename: character.codename,
        agentLevel: character.agentLevel ?? null,
        amount,
        status: "granted",
        transactionId: String(transaction._id),
        balance: transaction.balance,
      });
    } catch (error) {
      if (isDuplicateDailyAllowanceError(error)) {
        results.push(
          resultForSkipped(character, "skipped-already-paid", amount),
        );
        continue;
      }

      results.push({
        characterId,
        characterCodename: character.codename,
        agentLevel: character.agentLevel ?? null,
        amount,
        status: "failed",
        error: errorMessage(error),
      });
    }
  }

  const grantedResults = results.filter((result) => result.status === "granted");
  const failedResults = results.filter((result) => result.status === "failed");

  return {
    date,
    policyVersion: DAILY_ALLOWANCE_POLICY_VERSION,
    totalCandidates: candidates.length,
    granted: grantedResults.length,
    skipped: results.length - grantedResults.length - failedResults.length,
    failed: failedResults.length,
    totalAmount: grantedResults.reduce((sum, result) => sum + result.amount, 0),
    results,
  };
}
