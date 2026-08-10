import "./init";

import {
  addCredit,
  cancelQueuedResearchLabJob,
  charactersCol,
  claimResearchLabCharacterOutput,
  findResearchLabJob,
  findMainCharacterByOwner,
  findUserById,
  getCharacterBalance,
  insertInitialResearchLabState,
  insertResearchLabJob,
  masterItemsCol,
  prepareCharacterInventoryItemLocks,
  researchLabLinesCol,
  researchOutstandingKey,
  sharedInventoryCol,
  type ResearchDestination,
  type ResearchLabItemSnapshot,
  type ResearchLabJob,
  type ResearchLabLine,
} from "@stargate/shared-db";
import {
  MongoServerError,
  type ClientSession,
} from "mongodb";

import { childIdempotencyKey } from "../api/idempotency";
import {
  getResearchLabRecipe,
  ResearchLabError,
  type ResearchLabRecipe,
} from "../research/research-lab";

interface ResearchActor {
  id: string;
  displayName: string;
}

interface ActiveMainCharacter {
  id: string;
  codename: string;
  className: string;
  ownerName: string;
}

function requireRecipe(recipeId: string): ResearchLabRecipe {
  const recipe = getResearchLabRecipe(recipeId);
  if (!recipe) {
    throw new ResearchLabError(
      "RECIPE_NOT_REGISTERED",
      404,
      "등록된 연구 레시피가 아닙니다.",
    );
  }
  return recipe;
}

async function requireActiveMainCharacter(
  actor: ResearchActor,
  session: ClientSession,
): Promise<ActiveMainCharacter> {
  const user = await findUserById(actor.id, { session });
  if (!user || user.status !== "ACTIVE") {
    throw new ResearchLabError(
      "UNAUTHORIZED",
      401,
      "ACTIVE 사용자만 연구소를 이용할 수 있습니다.",
    );
  }
  const characters = await (await charactersCol())
    .find(
      {
        type: "AGENT",
        ownerId: actor.id,
        $or: [{ tier: "MAIN" }, { tier: { $exists: false } }],
      },
      { session },
    )
    .project({ _id: 1, codename: 1, "play.className": 1 })
    .toArray();
  if (characters.length > 1) {
    throw new ResearchLabError(
      "MAIN_CHARACTER_INTEGRITY",
      409,
      "MAIN AGENT 캐릭터 정합성을 확인할 수 없습니다.",
    );
  }
  const character = characters[0];
  if (!character?._id || character.type !== "AGENT") {
    throw new ResearchLabError(
      "NO_MAIN_CHARACTER",
      409,
      "ACTIVE 사용자의 MAIN AGENT 캐릭터가 필요합니다.",
    );
  }
  return {
    id: String(character._id),
    codename: character.codename,
    className: character.play.className,
    ownerName: user.discordUsername ?? user.displayName,
  };
}

async function resolveRecipeItems(
  recipe: ResearchLabRecipe,
  session: ClientSession,
): Promise<{ source: ResearchLabItemSnapshot; output: ResearchLabItemSnapshot }> {
  const rows = await (await masterItemsCol())
    .find(
      { slug: { $in: [recipe.source.slug, recipe.output.slug] } },
      { session },
    )
    .project({ _id: 1, slug: 1, name: 1, category: 1 })
    .toArray();
  const bySlug = new Map(rows.map((row) => [row.slug, row]));
  const source = bySlug.get(recipe.source.slug);
  const output = bySlug.get(recipe.output.slug);
  if (
    !source?._id ||
    source.category !== recipe.source.category ||
    !output?._id ||
    output.category !== recipe.output.category
  ) {
    throw new ResearchLabError(
      "ITEM_MISSING",
      503,
      "연구에 필요한 마스터 아이템이 준비되지 않았습니다.",
    );
  }
  return {
    source: {
      itemId: String(source._id),
      slug: recipe.source.slug,
      name: source.name,
      quantity: recipe.source.quantity,
    },
    output: {
      itemId: String(output._id),
      slug: recipe.output.slug,
      name: output.name,
      quantity: recipe.output.quantity,
    },
  };
}

async function consumeSharedSource(
  source: ResearchLabItemSnapshot,
  session: ClientSession,
): Promise<number> {
  const inventory = await sharedInventoryCol();
  const row = await inventory.findOneAndUpdate(
    {
      scope: "GLOBAL",
      itemId: source.itemId,
      quantity: { $gte: source.quantity },
    },
    { $inc: { quantity: -source.quantity } },
    { returnDocument: "after", session },
  );
  if (!row) {
    throw new ResearchLabError(
      "INSUFFICIENT_SOURCE_SAMPLE",
      409,
      "공용 인벤토리에 필요한 제출물이 없습니다.",
    );
  }
  if (row.quantity === 0) {
    await inventory.deleteOne({ _id: row._id, quantity: 0 }, { session });
  }
  return row.quantity;
}

function duplicateToDomainError(error: unknown): never {
  if (error instanceof MongoServerError && error.code === 11_000) {
    const indexName = String(error.message);
    if (indexName.includes("outstandingKey")) {
      throw new ResearchLabError(
        "OUTSTANDING_JOB_EXISTS",
        409,
        "이 캐릭터는 해당 연구선에 이미 미완료 작업이 있습니다.",
      );
    }
    if (
      indexName.includes("requestId") ||
      indexName.includes("activeLineKey")
    ) {
      throw new ResearchLabError(
        "DUPLICATE_REQUEST",
        409,
        "같은 연구 요청이 이미 처리 중입니다.",
      );
    }
    throw new ResearchLabError(
      "LINE_ALREADY_STARTED",
      409,
      "이 연구선의 최초 연구가 이미 시작되었습니다.",
    );
  }
  throw error;
}

export async function beginInitialResearch(input: {
  recipeId: string;
  actor: ResearchActor;
  requestId: string;
  session: ClientSession;
  now?: Date;
}): Promise<{ line: ResearchLabLine; job: ResearchLabJob; sourceQuantity: number }> {
  const recipe = requireRecipe(input.recipeId);
  const now = input.now ?? new Date();
  const character = await requireActiveMainCharacter(input.actor, input.session);
  if (character.className !== "과학자") {
    throw new ResearchLabError(
      "SCIENTIST_REQUIRED",
      403,
      "최초 연구는 과학자 캐릭터만 시작할 수 있습니다.",
    );
  }
  const existing = await (await researchLabLinesCol()).findOne(
    { _id: recipe.id },
    { session: input.session },
  );
  if (existing) {
    throw new ResearchLabError(
      "LINE_ALREADY_STARTED",
      409,
      "이 연구선의 최초 연구가 이미 시작되었습니다.",
    );
  }
  const items = await resolveRecipeItems(recipe, input.session);
  const sourceQuantity = await consumeSharedSource(items.source, input.session);
  const completesAt = new Date(now.getTime() + recipe.initialDurationMs);
  const line: ResearchLabLine = {
    _id: recipe.id,
    status: "INITIAL_RESEARCH",
    submittedByUserId: input.actor.id,
    submittedByCharacterId: character.id,
    submittedByCharacterCodename: character.codename,
    source: items.source,
    startedAt: now,
    completesAt,
    updatedAt: now,
    version: 2,
  };
  const job: ResearchLabJob = {
    requestId: input.requestId,
    recipeId: recipe.id,
    kind: "INITIAL",
    status: "RUNNING",
    destination: "SHARED",
    requesterUserId: input.actor.id,
    requesterDisplayName: input.actor.displayName,
    characterId: character.id,
    characterCodename: character.codename,
    output: items.output,
    creditCost: 0,
    durationMs: recipe.initialDurationMs,
    outstandingKey: researchOutstandingKey(character.id, recipe.id),
    activeLineKey: recipe.id,
    queuedAt: now,
    startedAt: now,
    completesAt,
    attempts: 0,
    createdAt: now,
    updatedAt: now,
    version: 2,
  };
  try {
    const inserted = await insertInitialResearchLabState({
      line,
      job,
      session: input.session,
    });
    return {
      line: { ...line, initialJobId: String(inserted._id) },
      job: inserted,
      sourceQuantity,
    };
  } catch (error) {
    duplicateToDomainError(error);
  }
}

export async function enqueueResearchJob(input: {
  recipeId: string;
  destination: ResearchDestination;
  actor: ResearchActor;
  requestId: string;
  session: ClientSession;
  now?: Date;
}): Promise<{ job: ResearchLabJob; balance: number }> {
  const recipe = requireRecipe(input.recipeId);
  const now = input.now ?? new Date();
  const line = await (await researchLabLinesCol()).findOne(
    { _id: recipe.id, status: "OPEN" },
    { session: input.session },
  );
  if (!line) {
    throw new ResearchLabError(
      "LINE_LOCKED",
      409,
      "이 연구선은 아직 반복 생산에 개방되지 않았습니다.",
    );
  }
  const character = await requireActiveMainCharacter(input.actor, input.session);
  const { output } = await resolveRecipeItems(recipe, input.session);
  let debit;
  try {
    debit = await addCredit({
      characterId: character.id,
      characterCodename: character.codename,
      ownerId: input.actor.id,
      ownerName: character.ownerName,
      amount: -recipe.repeatCreditCost,
      type: "PURCHASE",
      description: `${recipe.id} 연구 생산 요청`,
      metadata: {
        source: "research_lab",
        recipeId: recipe.id,
        destination: input.destination,
        itemId: output.itemId,
        itemSlug: output.slug,
        quantity: output.quantity,
      },
      createdById: input.actor.id,
      createdByName: input.actor.displayName,
      requestId: childIdempotencyKey(input.requestId, "research-debit"),
      session: input.session,
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "INSUFFICIENT_BALANCE") {
      throw new ResearchLabError(
        "INSUFFICIENT_BALANCE",
        409,
        "연구 생산에 필요한 크레딧이 부족합니다.",
      );
    }
    throw error;
  }
  const job: ResearchLabJob = {
    requestId: input.requestId,
    recipeId: recipe.id,
    kind: "REPEAT",
    status: "QUEUED",
    destination: input.destination,
    requesterUserId: input.actor.id,
    requesterDisplayName: input.actor.displayName,
    characterId: character.id,
    characterCodename: character.codename,
    output,
    creditCost: recipe.repeatCreditCost,
    durationMs: recipe.repeatDurationMs,
    outstandingKey: researchOutstandingKey(character.id, recipe.id),
    queuedAt: now,
    attempts: 0,
    createdAt: now,
    updatedAt: now,
    version: 2,
  };
  try {
    const inserted = await insertResearchLabJob(job, input.session);
    return { job: inserted, balance: debit.balance };
  } catch (error) {
    duplicateToDomainError(error);
  }
}

export async function cancelResearchJob(input: {
  jobId: string;
  actor: ResearchActor;
  session: ClientSession;
  now?: Date;
}): Promise<{ job: ResearchLabJob; balance: number }> {
  const now = input.now ?? new Date();
  const character = await requireActiveMainCharacter(input.actor, input.session);
  const existing = await findResearchLabJob(input.jobId, { session: input.session });
  if (
    !existing ||
    existing.requesterUserId !== input.actor.id ||
    existing.characterId !== character.id
  ) {
    throw new ResearchLabError("FORBIDDEN", 403, "본인의 연구 요청만 취소할 수 있습니다.");
  }
  if (existing.status === "CANCELLED") {
    return {
      job: existing,
      balance: await getCharacterBalance(existing.characterId, {
        session: input.session,
      }),
    };
  }
  if (existing.status !== "QUEUED") {
    throw new ResearchLabError(
      "JOB_NOT_CANCELLABLE",
      409,
      "대기 중인 연구 요청만 취소할 수 있습니다.",
    );
  }
  const cancelled = await cancelQueuedResearchLabJob({
    id: input.jobId,
    requesterUserId: input.actor.id,
    now,
    session: input.session,
  });
  if (!cancelled) {
    throw new ResearchLabError(
      "JOB_NOT_CANCELLABLE",
      409,
      "연구 요청 상태가 변경되어 취소할 수 없습니다.",
    );
  }
  const refund = await addCredit({
    characterId: cancelled.characterId,
    characterCodename: cancelled.characterCodename,
    ownerId: input.actor.id,
    ownerName: cancelled.requesterDisplayName,
    amount: cancelled.creditCost,
    type: "PURCHASE",
    description: `${cancelled.recipeId} 연구 생산 요청 취소 환불`,
    metadata: {
      source: "research_lab_refund",
      recipeId: cancelled.recipeId,
      jobId: String(cancelled._id),
    },
    createdById: input.actor.id,
    createdByName: input.actor.displayName,
    requestId: `research-refund:${String(cancelled._id)}`,
    session: input.session,
  });
  return { job: cancelled, balance: refund.balance };
}

export async function claimResearchJob(input: {
  jobId: string;
  actor: ResearchActor;
  session: ClientSession;
  now?: Date;
}): Promise<{ job: ResearchLabJob }> {
  const character = await requireActiveMainCharacter(input.actor, input.session);
  const claimed = await claimResearchLabCharacterOutput({
    id: input.jobId,
    requesterUserId: input.actor.id,
    characterId: character.id,
    now: input.now ?? new Date(),
    session: input.session,
  });
  if (!claimed) {
    throw new ResearchLabError(
      "JOB_NOT_CLAIMABLE",
      409,
      "수령 가능한 본인 연구 산출물이 아니거나 수령 기한이 지났습니다.",
    );
  }
  return { job: claimed.job };
}

/**
 * character_inventory의 첫 upsert도 transaction 안에서 안전하게 직렬화하려면
 * lock anchor를 transaction 시작 전에 만들어야 한다. 수량은 변경하지 않으며,
 * 소유자 확인을 먼저 수행해 타인의 job ID로 anchor를 만들 수 없게 한다.
 */
export async function prepareResearchJobClaimInventoryLock(input: {
  jobId: string;
  requesterUserId: string;
}): Promise<void> {
  const job = await findResearchLabJob(input.jobId);
  if (!job || job.requesterUserId !== input.requesterUserId) {
    throw new ResearchLabError(
      "FORBIDDEN",
      403,
      "본인의 연구 산출물만 수령할 수 있습니다.",
    );
  }
  if (job.destination !== "CHARACTER") {
    throw new ResearchLabError(
      "JOB_NOT_CLAIMABLE",
      409,
      "개인 수령으로 등록된 연구 산출물이 아닙니다.",
    );
  }
  let character;
  try {
    character = await findMainCharacterByOwner(input.requesterUserId);
  } catch {
    throw new ResearchLabError(
      "MAIN_CHARACTER_INTEGRITY",
      409,
      "MAIN AGENT 캐릭터 정합성을 확인할 수 없습니다.",
    );
  }
  if (!character?._id || String(character._id) !== job.characterId) {
    throw new ResearchLabError(
      "FORBIDDEN",
      403,
      "현재 본인이 소유한 MAIN AGENT의 연구 산출물만 수령할 수 있습니다.",
    );
  }
  await prepareCharacterInventoryItemLocks(job.characterId, [job.output.itemId]);
}
