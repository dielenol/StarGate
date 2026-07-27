import {
  AGENT_LEVELS,
  addCredit,
  createNotificationOnce,
  creditTransactionsCol,
  findUsersByIds,
  listAgentCharacters,
  type AgentCharacter,
  type AgentLevel,
  type Character,
  type CreditTransaction,
} from "@stargate/shared-db";

import { kstDateTag } from "../domain/kst-time.js";

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
const SYSTEM_USER_ID_SENTINEL = "000000000000000000000001";

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
  notificationStatus?: "sent" | "failed";
  notificationError?: string;
  error?: string;
}

export interface DailyCreditAllowanceSummary {
  date: string;
  policyVersion: string;
  totalCandidates: number;
  granted: number;
  skipped: number;
  failed: number;
  notificationsSent: number;
  notificationsFailed: number;
  totalAmount: number;
  results: DailyCreditAllowanceResult[];
}

interface DailyAllowanceDependencies {
  listCharacters?: typeof listAgentCharacters;
  listAlreadyPaid?: typeof listAlreadyPaidTransactions;
  findPaidTransaction?: typeof findDailyAllowanceTransaction;
  findOwners?: typeof findUsersByIds;
  grantCredit?: typeof addCredit;
  createAllowanceNotification?: typeof createNotificationOnce;
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
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11_000 &&
    "message" in error &&
    String(error.message).includes(DAILY_ALLOWANCE_INDEX_NAME)
  );
}

type DailyAllowanceTransaction = Pick<
  CreditTransaction,
  | "_id"
  | "characterId"
  | "characterCodename"
  | "ownerId"
  | "amount"
  | "balance"
>;

async function listAlreadyPaidTransactions(
  date: string,
): Promise<Map<string, DailyAllowanceTransaction>> {
  const col = await creditTransactionsCol();
  const rows = await col
    .find({
      "metadata.dailyAllowance": true,
      "metadata.dailyAllowanceDate": date,
    })
    .project<DailyAllowanceTransaction>({
      characterId: 1,
      characterCodename: 1,
      ownerId: 1,
      amount: 1,
      balance: 1,
    })
    .toArray();

  return new Map(rows.map((row) => [row.characterId, row]));
}

async function findDailyAllowanceTransaction(
  characterId: string,
  date: string,
): Promise<DailyAllowanceTransaction | null> {
  const col = await creditTransactionsCol();
  return col.findOne(
    {
      characterId,
      "metadata.dailyAllowance": true,
      "metadata.dailyAllowanceDate": date,
    },
    {
      projection: {
        characterId: 1,
        characterCodename: 1,
        ownerId: 1,
        amount: 1,
        balance: 1,
      },
    },
  );
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

function dailyAllowanceNotificationMessage(input: {
  characterCodename: string;
  amount: number;
  balance: number;
  date: string;
}): string {
  const sign = input.amount > 0 ? "+" : "";
  return [
    `${input.characterCodename} · ${sign}${input.amount.toLocaleString()} CR`,
    `현재 잔액 ${input.balance.toLocaleString()} CR`,
    `정기 정산 ${input.date}`,
  ].join(" · ");
}

async function deliverDailyAllowanceNotification(input: {
  character: AgentCharacter;
  transaction: DailyAllowanceTransaction;
  date: string;
  createNotification: typeof createNotificationOnce;
}): Promise<{
  notificationStatus: "sent" | "failed";
  notificationError?: string;
}> {
  const characterId = String(input.character._id);
  try {
    await input.createNotification({
      userId: input.transaction.ownerId,
      dedupeKey: `daily-allowance:v1:${input.date}:${characterId}:${input.transaction.ownerId}`,
      type: "CREDIT_RECEIVED",
      title: "일일 수당이 지급되었습니다",
      message: dailyAllowanceNotificationMessage({
        characterCodename: input.transaction.characterCodename,
        amount: input.transaction.amount,
        balance: input.transaction.balance,
        date: input.date,
      }),
      link: "/erp/credits",
    });
    return { notificationStatus: "sent" };
  } catch (error) {
    const notificationError = errorMessage(error);
    console.warn("[daily-allowance] notification failed", {
      characterId,
      date: input.date,
      error: notificationError,
    });
    return { notificationStatus: "failed", notificationError };
  }
}

export async function grantDailyCreditAllowances(
  now: Date = new Date(),
  dependencies: DailyAllowanceDependencies = {},
): Promise<DailyCreditAllowanceSummary> {
  const date = kstDateTag(now);
  const listCharacters =
    dependencies.listCharacters ?? listAgentCharacters;
  const listAlreadyPaid =
    dependencies.listAlreadyPaid ?? listAlreadyPaidTransactions;
  const findPaidTransaction =
    dependencies.findPaidTransaction ?? findDailyAllowanceTransaction;
  const findOwners = dependencies.findOwners ?? findUsersByIds;
  const grantCredit = dependencies.grantCredit ?? addCredit;
  const [characters, alreadyPaidByCharacter] = await Promise.all([
    listCharacters("MAIN"),
    listAlreadyPaid(date),
  ]);

  const candidates = characters.filter(isOperationalMainAgent);
  const ownerIds = Array.from(
    new Set(
      candidates
        .map((character) => character.ownerId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );
  const owners = await findOwners(ownerIds);
  const ownerById = new Map(owners.map((owner) => [String(owner._id), owner]));
  const createAllowanceNotification =
    dependencies.createAllowanceNotification ?? createNotificationOnce;

  const results: DailyCreditAllowanceResult[] = [];

  for (const character of candidates) {
    const characterId = String(character._id);
    const amount = getDailyAllowanceAmount(character.agentLevel);

    if (amount === null) {
      results.push(resultForSkipped(character, "skipped-ineligible-level"));
      continue;
    }

    const alreadyPaid = alreadyPaidByCharacter.get(characterId);
    if (alreadyPaid) {
      const notification = await deliverDailyAllowanceNotification({
        character,
        transaction: alreadyPaid,
        date,
        createNotification: createAllowanceNotification,
      });
      results.push({
        ...resultForSkipped(character, "skipped-already-paid", amount),
        transactionId: alreadyPaid._id ? String(alreadyPaid._id) : undefined,
        balance: alreadyPaid.balance,
        ...notification,
      });
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
      const transaction = await grantCredit({
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

      const notification = await deliverDailyAllowanceNotification({
        character,
        transaction,
        date,
        createNotification: createAllowanceNotification,
      });

      results.push({
        characterId,
        characterCodename: character.codename,
        agentLevel: character.agentLevel ?? null,
        amount,
        status: "granted",
        transactionId: String(transaction._id),
        balance: transaction.balance,
        ...notification,
      });
    } catch (error) {
      if (isDuplicateDailyAllowanceError(error)) {
        const paidTransaction = await findPaidTransaction(characterId, date);
        if (!paidTransaction) {
          results.push({
            characterId,
            characterCodename: character.codename,
            agentLevel: character.agentLevel ?? null,
            amount,
            status: "failed",
            error: "duplicate allowance exists but transaction lookup failed",
          });
          continue;
        }
        const notification = await deliverDailyAllowanceNotification({
          character,
          transaction: paidTransaction,
          date,
          createNotification: createAllowanceNotification,
        });
        results.push({
          ...resultForSkipped(character, "skipped-already-paid", amount),
          transactionId: paidTransaction._id
            ? String(paidTransaction._id)
            : undefined,
          balance: paidTransaction.balance,
          ...notification,
        });
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
  const notificationsSent = results.filter(
    (result) => result.notificationStatus === "sent",
  ).length;
  const notificationsFailed = results.filter(
    (result) => result.notificationStatus === "failed",
  ).length;

  return {
    date,
    policyVersion: DAILY_ALLOWANCE_POLICY_VERSION,
    totalCandidates: candidates.length,
    granted: grantedResults.length,
    skipped: results.length - grantedResults.length - failedResults.length,
    failed: failedResults.length,
    notificationsSent,
    notificationsFailed,
    totalAmount: grantedResults.reduce((sum, result) => sum + result.amount, 0),
    results,
  };
}
