import "./init";

import {
  addToSharedInventory,
  charactersCol,
  getDb,
  masterItemsCol,
  sharedInventoryCol,
  usersCol,
} from "@stargate/shared-db";
import { MongoServerError, ObjectId, type ClientSession } from "mongodb";

import {
  ZULU_SAMPLE_LINE_ID,
  ZuluSampleLabError,
  getZuluExtractionRecipe,
  type ExtractZuluSampleResponse,
  type UnlockZuluSampleLineResponse,
  type ZuluExtractionRecipe,
  type ZuluSampleLabItemDto,
  type ZuluSampleLabOverview,
  type ZuluSampleLineDto,
} from "../research/zulu-sample-lab";
import { addCredit, getCharacterBalance } from "./credits";
import { findMainCharacterLiteByOwner } from "./characters";

interface ZuluSampleLineDocument {
  _id: typeof ZULU_SAMPLE_LINE_ID;
  unlockedAt: Date;
  unlockedById: string;
  unlockedByName: string;
  sourceRequestId: string;
  version: 1;
}

interface LabItemRef {
  id: string;
  slug: string;
  name: string;
}

interface ActorIdentity {
  id: string;
  displayName: string;
}

interface ExtractionCharacter {
  id: string;
  codename: string;
}

async function sampleLinesCol() {
  const db = await getDb();
  return db.collection<ZuluSampleLineDocument>("zulu_sample_lines");
}

function requireRecipe(): ZuluExtractionRecipe {
  const recipe = getZuluExtractionRecipe(ZULU_SAMPLE_LINE_ID);
  if (!recipe) {
    throw new ZuluSampleLabError(
      "RECIPE_NOT_REGISTERED",
      503,
      "등록된 ZULU 추출 레시피를 찾을 수 없습니다.",
    );
  }
  return recipe;
}

function serializeLine(line: ZuluSampleLineDocument): ZuluSampleLineDto {
  return {
    id: line._id,
    unlockedAt: line.unlockedAt.toISOString(),
    unlockedByName: line.unlockedByName,
  };
}

async function resolveLabItems(
  recipe: ZuluExtractionRecipe,
  session?: ClientSession,
): Promise<{
  source: LabItemRef;
  sample: LabItemRef;
}> {
  const collection = await masterItemsCol();
  const items = await collection
    .find(
      {
        slug: { $in: [recipe.source.slug, recipe.output.slug] },
      },
      { session },
    )
    .project({ _id: 1, slug: 1, name: 1, category: 1 })
    .toArray();
  const bySlug = new Map(items.map((item) => [item.slug, item]));
  const source = bySlug.get(recipe.source.slug);
  const sample = bySlug.get(recipe.output.slug);
  if (
    !source?._id ||
    source.category !== recipe.source.category ||
    !sample?._id ||
    sample.category !== recipe.output.category
  ) {
    throw new ZuluSampleLabError(
      "LAB_ITEM_MISSING",
      503,
      "ZULU-0028 연구에 필요한 마스터 아이템이 준비되지 않았습니다.",
    );
  }
  return {
    source: {
      id: String(source._id),
      slug: recipe.source.slug,
      name: source.name,
    },
    sample: {
      id: String(sample._id),
      slug: recipe.output.slug,
      name: sample.name,
    },
  };
}

async function sharedQuantity(
  itemId: string,
  session?: ClientSession,
): Promise<number> {
  const row = await (await sharedInventoryCol()).findOne(
    { scope: "GLOBAL", itemId },
    { session, projection: { quantity: 1 } },
  );
  return row?.quantity ?? 0;
}

async function removeSharedItem(
  item: LabItemRef,
  quantity: number,
  session: ClientSession,
): Promise<number> {
  const collection = await sharedInventoryCol();
  const row = await collection.findOneAndUpdate(
    { scope: "GLOBAL", itemId: item.id, quantity: { $gte: quantity } },
    { $inc: { quantity: -quantity } },
    { returnDocument: "after", session },
  );
  if (!row) {
    throw new ZuluSampleLabError(
      "INSUFFICIENT_SOURCE_SAMPLE",
      409,
      "공용 인벤토리에 ZULU-0028 격리 개체가 없습니다.",
    );
  }
  if (row.quantity === 0) {
    await collection.deleteOne({ _id: row._id, quantity: 0 }, { session });
  }
  return row.quantity;
}

async function addSharedItem(
  item: LabItemRef,
  quantity: number,
  note: string,
  session: ClientSession,
): Promise<number> {
  const row = await addToSharedInventory(
    {
      scope: "GLOBAL",
      itemId: item.id,
      itemName: item.name,
      quantity,
      acquiredAt: new Date(),
      note,
    },
    { session },
  );
  return row.quantity;
}

async function requireActiveGm(
  actor: ActorIdentity,
  session: ClientSession,
) {
  if (!ObjectId.isValid(actor.id)) {
    throw new ZuluSampleLabError("FORBIDDEN", 403, "GM 권한이 필요합니다.");
  }
  const user = await (await usersCol()).findOne(
    { _id: new ObjectId(actor.id), status: "ACTIVE", role: "GM" },
    { session, projection: { displayName: 1 } },
  );
  if (!user) {
    throw new ZuluSampleLabError("FORBIDDEN", 403, "GM 권한이 필요합니다.");
  }
  return user;
}

async function requireActiveMainAgent(args: {
  actorId: string;
  expectedCharacter: ExtractionCharacter;
  session: ClientSession;
}) {
  if (!ObjectId.isValid(args.actorId) || !ObjectId.isValid(args.expectedCharacter.id)) {
    throw new ZuluSampleLabError(
      "NO_MAIN_CHARACTER",
      409,
      "ACTIVE 사용자의 MAIN AGENT 캐릭터가 필요합니다.",
    );
  }
  const user = await (await usersCol()).findOne(
    { _id: new ObjectId(args.actorId), status: "ACTIVE" },
    {
      session: args.session,
      projection: { displayName: 1, discordUsername: 1 },
    },
  );
  if (!user) {
    throw new ZuluSampleLabError(
      "UNAUTHORIZED",
      401,
      "ACTIVE 사용자만 샘플을 추출할 수 있습니다.",
    );
  }

  const mains = await (await charactersCol())
    .find(
      {
        type: "AGENT",
        ownerId: args.actorId,
        $or: [{ tier: "MAIN" }, { tier: { $exists: false } }],
      },
      { session: args.session },
    )
    .project({ _id: 1, codename: 1 })
    .toArray();
  if (mains.length > 1) {
    throw new ZuluSampleLabError(
      "MAIN_CHARACTER_INTEGRITY",
      409,
      "MAIN AGENT 캐릭터 정합성을 확인할 수 없습니다.",
    );
  }
  const main = mains[0];
  if (!main?._id || String(main._id) !== args.expectedCharacter.id) {
    throw new ZuluSampleLabError(
      "NO_MAIN_CHARACTER",
      409,
      "ACTIVE 사용자의 MAIN AGENT 캐릭터가 필요합니다.",
    );
  }
  return {
    character: {
      id: String(main._id),
      codename: main.codename,
    },
    ownerName: user.discordUsername ?? user.displayName,
  };
}

function itemDto(
  item: LabItemRef,
  image: string,
  quantity: number,
): ZuluSampleLabItemDto {
  return {
    itemId: item.id,
    slug: item.slug,
    name: item.name,
    image,
    sharedQuantity: quantity,
  };
}

export async function getZuluSampleLabOverview(args: {
  userId: string | null;
  isGm: boolean;
}): Promise<ZuluSampleLabOverview> {
  const recipe = requireRecipe();
  const { source, sample } = await resolveLabItems(recipe);
  const [line, sourceQuantity, sampleQuantity] = await Promise.all([
    (await sampleLinesCol()).findOne({ _id: ZULU_SAMPLE_LINE_ID }),
    sharedQuantity(source.id),
    sharedQuantity(sample.id),
  ]);

  let character: ExtractionCharacter | null = null;
  let balance: number | null = null;
  let eligibilityCode: ZuluSampleLabOverview["viewer"]["eligibilityCode"] =
    "NO_MAIN_CHARACTER";
  try {
    const main = args.userId
      ? await findMainCharacterLiteByOwner(args.userId)
      : null;
    if (main?._id && main.type === "AGENT") {
      character = { id: String(main._id), codename: main.codename };
      balance = await getCharacterBalance(character.id);
      eligibilityCode = "ELIGIBLE";
    }
  } catch {
    eligibilityCode = "MAIN_CHARACTER_INTEGRITY";
  }

  return {
    recipe: {
      id: recipe.id,
      sourceQuantity: recipe.source.quantity,
      initialOutputQuantity: recipe.output.initialQuantity,
      extractionOutputQuantity: recipe.output.extractionQuantity,
    },
    line: line ? serializeLine(line) : null,
    source: itemDto(source, recipe.source.image, sourceQuantity),
    sample: itemDto(sample, recipe.output.image, sampleQuantity),
    extractionCost: recipe.extraction.creditCost,
    viewer: {
      isGm: args.isGm,
      eligibilityCode,
      character,
      balance,
    },
  };
}

export async function unlockZuluSampleLine(args: {
  actor: ActorIdentity;
  requestId: string;
  session: ClientSession;
}): Promise<UnlockZuluSampleLineResponse> {
  const recipe = requireRecipe();
  const gm = await requireActiveGm(args.actor, args.session);
  const lines = await sampleLinesCol();
  const existing = await lines.findOne(
    { _id: ZULU_SAMPLE_LINE_ID },
    { session: args.session },
  );
  if (existing) {
    throw new ZuluSampleLabError(
      "LINE_ALREADY_UNLOCKED",
      409,
      "ZULU-0028 샘플 라인은 이미 개방되었습니다.",
    );
  }

  const { source, sample } = await resolveLabItems(recipe, args.session);
  const sourceQuantity = await removeSharedItem(
    source,
    recipe.source.quantity,
    args.session,
  );
  const unlockedAt = new Date();
  const line: ZuluSampleLineDocument = {
    _id: ZULU_SAMPLE_LINE_ID,
    unlockedAt,
    unlockedById: args.actor.id,
    unlockedByName: gm.displayName,
    sourceRequestId: args.requestId,
    version: 1,
  };
  try {
    await lines.insertOne(line, { session: args.session });
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      throw new ZuluSampleLabError(
        "LINE_ALREADY_UNLOCKED",
        409,
        "ZULU-0028 샘플 라인은 이미 개방되었습니다.",
      );
    }
    throw error;
  }
  const sampleQuantity = await addSharedItem(
    sample,
    recipe.output.initialQuantity,
    "ZULU-0028 샘플 라인 최초 개방 보상",
    args.session,
  );
  return {
    line: serializeLine(line),
    sourceQuantity,
    sampleQuantity,
  };
}

export async function extractZuluSample(args: {
  actor: ActorIdentity;
  expectedCharacter: ExtractionCharacter;
  requestId: string;
  session: ClientSession;
}): Promise<ExtractZuluSampleResponse> {
  const recipe = requireRecipe();
  const line = await (await sampleLinesCol()).findOne(
    { _id: ZULU_SAMPLE_LINE_ID },
    { session: args.session },
  );
  if (!line) {
    throw new ZuluSampleLabError(
      "LINE_LOCKED",
      409,
      "ZULU-0028 샘플 라인이 아직 개방되지 않았습니다.",
    );
  }

  const owner = await requireActiveMainAgent({
    actorId: args.actor.id,
    expectedCharacter: args.expectedCharacter,
    session: args.session,
  });
  const { sample } = await resolveLabItems(recipe, args.session);
  let debit;
  try {
    debit = await addCredit({
      characterId: owner.character.id,
      characterCodename: owner.character.codename,
      ownerId: args.actor.id,
      ownerName: owner.ownerName,
      amount: -recipe.extraction.creditCost,
      type: "PURCHASE",
      description: "ZULU-0028 샘플 추출",
      metadata: {
        source: "zulu_sample_lab",
        lineId: ZULU_SAMPLE_LINE_ID,
        itemId: sample.id,
        itemSlug: sample.slug,
        quantity: recipe.output.extractionQuantity,
      },
      createdById: args.actor.id,
      createdByName: args.actor.displayName,
      requestId: args.requestId,
      session: args.session,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "INSUFFICIENT_BALANCE"
    ) {
      throw new ZuluSampleLabError(
        "INSUFFICIENT_BALANCE",
        409,
        "샘플 추출에 필요한 크레딧이 부족합니다.",
      );
    }
    throw error;
  }
  const sampleQuantity = await addSharedItem(
    sample,
    recipe.output.extractionQuantity,
    `${owner.character.codename} ZULU-0028 샘플 추출`,
    args.session,
  );
  return {
    lineId: ZULU_SAMPLE_LINE_ID,
    balance: debit.balance,
    sampleQuantity,
  };
}
