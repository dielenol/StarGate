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
  BROKEN_SYLLABLE_IMAGE,
  BROKEN_SYLLABLE_SLUG,
  ZULU_CONTAINED_ENTITY_IMAGE,
  ZULU_CONTAINED_ENTITY_SLUG,
  ZULU_SAMPLE_EXTRACTION_COST,
  ZULU_SAMPLE_LINE_ID,
  ZuluSampleLabError,
  type ExtractZuluSampleResponse,
  type UnlockZuluSampleLineResponse,
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
  slug: typeof ZULU_CONTAINED_ENTITY_SLUG | typeof BROKEN_SYLLABLE_SLUG;
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

function serializeLine(line: ZuluSampleLineDocument): ZuluSampleLineDto {
  return {
    id: line._id,
    unlockedAt: line.unlockedAt.toISOString(),
    unlockedByName: line.unlockedByName,
  };
}

async function resolveLabItems(
  session?: ClientSession,
): Promise<{
  source: LabItemRef;
  sample: LabItemRef;
}> {
  const collection = await masterItemsCol();
  const items = await collection
    .find(
      {
        slug: { $in: [ZULU_CONTAINED_ENTITY_SLUG, BROKEN_SYLLABLE_SLUG] },
      },
      { session },
    )
    .project({ _id: 1, slug: 1, name: 1 })
    .toArray();
  const bySlug = new Map(items.map((item) => [item.slug, item]));
  const source = bySlug.get(ZULU_CONTAINED_ENTITY_SLUG);
  const sample = bySlug.get(BROKEN_SYLLABLE_SLUG);
  if (!source?._id || !sample?._id) {
    throw new ZuluSampleLabError(
      "LAB_ITEM_MISSING",
      503,
      "ZULU-0028 연구에 필요한 마스터 아이템이 준비되지 않았습니다.",
    );
  }
  return {
    source: {
      id: String(source._id),
      slug: ZULU_CONTAINED_ENTITY_SLUG,
      name: source.name,
    },
    sample: {
      id: String(sample._id),
      slug: BROKEN_SYLLABLE_SLUG,
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

async function removeOneSharedItem(
  item: LabItemRef,
  session: ClientSession,
): Promise<number> {
  const collection = await sharedInventoryCol();
  const row = await collection.findOneAndUpdate(
    { scope: "GLOBAL", itemId: item.id, quantity: { $gte: 1 } },
    { $inc: { quantity: -1 } },
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

async function addOneSharedItem(
  item: LabItemRef,
  note: string,
  session: ClientSession,
): Promise<number> {
  const row = await addToSharedInventory(
    {
      scope: "GLOBAL",
      itemId: item.id,
      itemName: item.name,
      quantity: 1,
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
  quantity: number,
): ZuluSampleLabItemDto {
  return {
    itemId: item.id,
    slug: item.slug,
    name: item.name,
    image:
      item.slug === ZULU_CONTAINED_ENTITY_SLUG
        ? ZULU_CONTAINED_ENTITY_IMAGE
        : BROKEN_SYLLABLE_IMAGE,
    sharedQuantity: quantity,
  };
}

export async function getZuluSampleLabOverview(args: {
  userId: string;
  isGm: boolean;
}): Promise<ZuluSampleLabOverview> {
  const { source, sample } = await resolveLabItems();
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
    const main = await findMainCharacterLiteByOwner(args.userId);
    if (main?._id && main.type === "AGENT") {
      character = { id: String(main._id), codename: main.codename };
      balance = await getCharacterBalance(character.id);
      eligibilityCode = "ELIGIBLE";
    }
  } catch {
    eligibilityCode = "MAIN_CHARACTER_INTEGRITY";
  }

  return {
    line: line ? serializeLine(line) : null,
    source: itemDto(source, sourceQuantity),
    sample: itemDto(sample, sampleQuantity),
    extractionCost: ZULU_SAMPLE_EXTRACTION_COST,
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

  const { source, sample } = await resolveLabItems(args.session);
  const sourceQuantity = await removeOneSharedItem(source, args.session);
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
  const sampleQuantity = await addOneSharedItem(
    sample,
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
  const { sample } = await resolveLabItems(args.session);
  let debit;
  try {
    debit = await addCredit({
      characterId: owner.character.id,
      characterCodename: owner.character.codename,
      ownerId: args.actor.id,
      ownerName: owner.ownerName,
      amount: -ZULU_SAMPLE_EXTRACTION_COST,
      type: "PURCHASE",
      description: "ZULU-0028 샘플 추출",
      metadata: {
        source: "zulu_sample_lab",
        lineId: ZULU_SAMPLE_LINE_ID,
        itemId: sample.id,
        itemSlug: sample.slug,
        quantity: 1,
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
  const sampleQuantity = await addOneSharedItem(
    sample,
    `${owner.character.codename} ZULU-0028 샘플 추출`,
    args.session,
  );
  return {
    lineId: ZULU_SAMPLE_LINE_ID,
    balance: debit.balance,
    sampleQuantity,
  };
}
