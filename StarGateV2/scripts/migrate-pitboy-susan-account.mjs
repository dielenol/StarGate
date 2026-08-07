/**
 * pitboy Discord GM 계정에 Credentials 로그인을 추가하고 CLAIRVOYANCE를
 * 표시용 메인 NPC로 연결한다.
 *
 * 기본은 읽기 전용 dry-run이다. 실제 쓰기는 --execute --yes와
 * PITBOY_CREDENTIAL_PASSWORD 환경변수를 모두 요구한다. 비밀번호·해시는 출력하지 않는다.
 */

import { compare, hash } from "bcryptjs";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MongoClient, ObjectId } from "mongodb";

function loadEnvFile(fileName) {
  try {
    const source = readFileSync(resolve(process.cwd(), fileName), "utf8");
    for (const line of source.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator === -1) continue;
      const key = trimmed.slice(0, separator).trim();
      let value = trimmed.slice(separator + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // Optional files. Required values are checked before connecting/executing.
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const EXECUTE = process.argv.includes("--execute");
const CONFIRMED = process.argv.includes("--yes");
const TARGET_USER_ID = "69f2e63103373369795418fd";
const TARGET_DISCORD_ID = "494367952276160512";
const TARGET_DISCORD_GLOBAL_NAME = "pitboy";
const TARGET_USERNAME = "pitboy";
const TARGET_NPC_CODENAME = "CLAIRVOYANCE";
const LEGACY_MAIN_CODENAME = "GM";
const PIXEL_PROFILE = "/assets/npcs/Clairvoyance-pixel-profile.webp";
const PIXEL_CHARACTER = "/assets/npcs/Clairvoyance-pixel-character.webp";
const MAIN_IMAGE = "/assets/npcs/Clairvoyance-profile.webp";
const BCRYPT_ROUNDS = 12;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function loadPlan(db) {
  const users = db.collection("users");
  const characters = db.collection("characters");
  const user = await users.findOne(
    { _id: new ObjectId(TARGET_USER_ID) },
    { projection: {
      username: 1,
      hashedPassword: 1,
      discordId: 1,
      discordUsername: 1,
      discordGlobalName: 1,
      role: 1,
      status: 1,
      characterIds: 1,
    } },
  );
  assert(user, "대상 pitboy 계정이 없습니다.");
  assert(user.discordId === TARGET_DISCORD_ID, "대상 Discord id가 다릅니다.");
  assert(user.discordGlobalName === TARGET_DISCORD_GLOBAL_NAME, "대상 Discord 닉네임이 다릅니다.");
  assert(user.role === "GM" && user.status === "ACTIVE", "대상 계정이 ACTIVE GM이 아닙니다.");

  const userId = String(user._id);
  assert(userId === TARGET_USER_ID, "대상 user id가 고정값과 다릅니다.");
  const generatedDiscordUsername = `_discord_${user.discordId}`;
  if (user.hashedPassword) {
    assert(user.username === TARGET_USERNAME, "기존 Credentials 계정의 username이 pitboy가 아닙니다.");
  } else {
    assert(
      user.username === generatedDiscordUsername,
      "Credentials 추가 전 username이 Discord 자동생성 형식이 아닙니다.",
    );
  }
  const usernameCollision = await users.findOne({
    username: TARGET_USERNAME,
    _id: { $ne: user._id },
  });
  assert(!usernameCollision, "username=pitboy를 다른 계정이 사용 중입니다.");

  const legacyMain = await characters.findOne({
    codename: LEGACY_MAIN_CODENAME,
    type: "AGENT",
    ownerId: userId,
  });
  assert(legacyMain, "pitboy 소유 레거시 GM 캐릭터가 없습니다.");
  assert(legacyMain.tier === "MAIN", "레거시 GM 캐릭터가 MAIN이 아닙니다.");

  const susan = await characters.findOne({
    codename: TARGET_NPC_CODENAME,
    type: "NPC",
  });
  assert(susan, "CLAIRVOYANCE NPC가 없습니다.");
  assert(susan.agentLevel === "H", "CLAIRVOYANCE 등급이 H가 아닙니다.");
  assert(
    susan.ownerId == null || susan.ownerId === userId,
    "CLAIRVOYANCE가 다른 계정에 연결되어 있습니다.",
  );

  const selectedObjectIds = (user.characterIds ?? [])
    .filter((id) => ObjectId.isValid(id))
    .map((id) => new ObjectId(id));
  const selectedOwnedNpcs = selectedObjectIds.length
    ? await characters
        .find({
          _id: { $in: selectedObjectIds },
          type: "NPC",
          ownerId: userId,
        })
        .project({ codename: 1 })
        .toArray()
    : [];
  assert(
    selectedOwnedNpcs.length === 0 ||
      (selectedOwnedNpcs.length === 1 && selectedOwnedNpcs[0].codename === TARGET_NPC_CODENAME),
    "pitboy 표시용 NPC 선택이 CLAIRVOYANCE 단일 항목이 아닙니다.",
  );

  const legacyCharacterId = String(legacyMain._id);
  const creditBalance = await db.collection("credit_balances").findOne(
    { characterId: legacyCharacterId },
    { projection: { balance: 1 } },
  );
  const economy = {
    inventoryRows: await db.collection("character_inventory").countDocuments({
      characterId: legacyCharacterId,
    }),
    creditTransactionRows: await db
      .collection("credit_transactions")
      .countDocuments({ characterId: legacyCharacterId }),
    creditBalanceRows: await db
      .collection("credit_balances")
      .countDocuments({ characterId: legacyCharacterId }),
    creditBalance: creditBalance?.balance ?? null,
    stockHoldingRows: await db
      .collection("stock_holdings")
      .countDocuments({ characterId: legacyCharacterId }),
  };

  return { user, userId, legacyMain, susan, economy };
}

function printPlan(plan, mode) {
  console.log(
    JSON.stringify(
      {
        mode,
        target: {
          accountId: plan.userId,
          npcId: String(plan.susan._id),
        },
        before: {
          username: plan.user.username,
          role: plan.user.role,
          status: plan.user.status,
          hasCredentials: Boolean(plan.user.hashedPassword),
          mainCharacter: {
            codename: plan.legacyMain.codename,
            tier: plan.legacyMain.tier ?? null,
          },
          susanSelectedForDisplay: (plan.user.characterIds ?? []).includes(String(plan.susan._id)),
          susanOwnerId: plan.susan.ownerId ?? null,
        },
        after: {
          username: TARGET_USERNAME,
          role: "GM",
          status: "ACTIVE",
          hasCredentials: true,
          displayedCharacter: {
            codename: TARGET_NPC_CODENAME,
            agentLevel: plan.susan.agentLevel,
          },
          legacyCharacter: {
            codename: LEGACY_MAIN_CODENAME,
            tier: "MAIN",
            ownerPreserved: true,
            economicMainPreserved: true,
          },
          assets: {
            previewImage: PIXEL_PROFILE,
            pixelCharacterImage: PIXEL_CHARACTER,
            mainImage: MAIN_IMAGE,
          },
        },
        sideEffects: {
          discordLinkPreserved: true,
          actualRolePreserved: "GM",
          economicCollectionsModified: false,
          legacyCharacterEconomyPreserved: plan.economy,
        },
      },
      null,
      2,
    ),
  );
}

async function executePlan(client, db, plan, password) {
  assert(
    password.length >= 4 && password.length <= 128,
    "이 전용 migration의 Credentials 비밀번호는 4~128자여야 합니다.",
  );
  let passwordHash = null;
  if (plan.user.hashedPassword) {
    assert(
      await compare(password, plan.user.hashedPassword),
      "기존 Credentials 비밀번호와 입력값이 다릅니다. 이 migration은 비밀번호 회전을 허용하지 않습니다.",
    );
  } else {
    passwordHash = await hash(password, BCRYPT_ROUNDS);
  }
  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      const now = new Date();
      const susanId = String(plan.susan._id);
      const susanAlreadySelected = (plan.user.characterIds ?? []).includes(susanId);
      const userUpdate = {
        $addToSet: { characterIds: susanId },
      };
      if (passwordHash || !susanAlreadySelected) {
        userUpdate.$set = {
          updatedAt: now,
        };
        if (passwordHash) {
          userUpdate.$set.username = TARGET_USERNAME;
          userUpdate.$set.hashedPassword = passwordHash;
          userUpdate.$set.passwordChangedAt = now;
        }
      }
      const userResult = await db.collection("users").updateOne(
        {
          _id: new ObjectId(plan.userId),
          role: "GM",
          status: "ACTIVE",
          discordId: TARGET_DISCORD_ID,
          discordGlobalName: TARGET_DISCORD_GLOBAL_NAME,
          username: plan.user.username,
          hashedPassword: plan.user.hashedPassword ?? null,
          characterIds: plan.user.characterIds,
        },
        userUpdate,
        { session },
      );
      assert(userResult.matchedCount === 1, "pitboy user CAS가 일치하지 않습니다.");

      const legacyMainResult = await db.collection("characters").updateOne(
        {
          _id: plan.legacyMain._id,
          codename: LEGACY_MAIN_CODENAME,
          type: "AGENT",
          ownerId: plan.userId,
          tier: "MAIN",
        },
        { $set: { tier: "MAIN" } },
        { session },
      );
      assert(
        legacyMainResult.matchedCount === 1,
        "레거시 GM MAIN transaction precondition이 일치하지 않습니다.",
      );

      const susanResult = await db.collection("characters").updateOne(
        {
          _id: plan.susan._id,
          codename: TARGET_NPC_CODENAME,
          type: "NPC",
          agentLevel: "H",
          ownerId: plan.susan.ownerId ?? null,
          previewImage: plan.susan.previewImage ?? null,
          pixelCharacterImage: plan.susan.pixelCharacterImage ?? null,
          "lore.mainImage": plan.susan.lore?.mainImage ?? null,
        },
        {
          $set: {
            ownerId: plan.userId,
            previewImage: PIXEL_PROFILE,
            pixelCharacterImage: PIXEL_CHARACTER,
            "lore.mainImage": MAIN_IMAGE,
            updatedAt: now,
          },
        },
        { session },
      );
      assert(susanResult.matchedCount === 1, "CLAIRVOYANCE CAS가 일치하지 않습니다.");
    });
  } finally {
    await session.endSession();
  }

  const after = await loadPlan(db);
  assert(after.user.username === TARGET_USERNAME, "username 사후조건 실패");
  assert(after.user.role === "GM", "GM role 사후조건 실패");
  assert(after.user.status === "ACTIVE", "ACTIVE status 사후조건 실패");
  assert(await compare(password, after.user.hashedPassword), "Credentials 비밀번호 사후조건 실패");
  assert(after.legacyMain.tier === "MAIN", "레거시 GM MAIN 사후조건 실패");
  assert(
    after.user.characterIds.includes(String(after.susan._id)),
    "CLAIRVOYANCE 표시 선택 사후조건 실패",
  );
  assert(after.susan.agentLevel === "H", "CLAIRVOYANCE H 등급 사후조건 실패");
  assert(after.susan.ownerId === after.userId, "CLAIRVOYANCE owner 사후조건 실패");
  assert(after.susan.previewImage === PIXEL_PROFILE, "pixel profile 사후조건 실패");
  assert(after.susan.pixelCharacterImage === PIXEL_CHARACTER, "pixel character 사후조건 실패");
  assert(after.susan.lore?.mainImage === MAIN_IMAGE, "main image 사후조건 실패");
  assert(
    JSON.stringify(after.economy) === JSON.stringify(plan.economy),
    "레거시 캐릭터 경제 데이터가 변경되었습니다.",
  );
  printPlan(after, "execute-verified");
}

if (EXECUTE !== CONFIRMED) {
  throw new Error("실제 적용에는 --execute --yes가 모두 필요합니다.");
}

const uri = process.env.MONGODB_URI;
assert(uri, "MONGODB_URI 환경변수가 필요합니다.");
const dbName = process.env.DB_NAME || process.env.MONGODB_DB_NAME || "stargate";
const client = new MongoClient(uri, { maxPoolSize: 2 });

try {
  await client.connect();
  const db = client.db(dbName);
  const plan = await loadPlan(db);
  if (!EXECUTE) {
    printPlan(plan, "dry-run");
  } else {
    const password = process.env.PITBOY_CREDENTIAL_PASSWORD;
    assert(password, "실행 시 PITBOY_CREDENTIAL_PASSWORD 환경변수가 필요합니다.");
    await executePlan(client, db, plan, password);
  }
} finally {
  await client.close();
}
