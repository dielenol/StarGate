import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ObjectId } from "mongodb";

process.env.DISCORD_TOKEN ??= "test-token";
process.env.DISCORD_CLIENT_ID ??= "test-client";
process.env.MONGODB_URI ??= "mongodb://127.0.0.1:27017/test";

const {
  buildCraftingVoteButtonCustomId,
  buildCraftingVoteLedgerId,
  buildCraftingVoteResolutionReceipt,
  classifyCraftingVotePublication,
  countCraftingVoteBallots,
  getCraftingVotePhase,
  isCanonicalCraftingVoteSource,
  isCraftingVoteAnnouncementDeletionSafe,
  parseCraftingVoteButtonCustomId,
} = await import("../src/services/crafting-vote.js");
const {
  CENSOR3_VOTE_CHANNEL_ID,
  CRAFTING_VOTE_BUTTON_PREFIX,
} = await import("../src/constants/registrar.js");
const { CRAFTING_VOTE_CMD } = await import("../src/commands/register.js");

function vote(overrides: Record<string, unknown> = {}) {
  const now = new Date("2026-08-06T12:00:00.000Z");
  return {
    _id: new ObjectId("507f1f77bcf86cd799439011"),
    schemaVersion: 1 as const,
    revision: 0,
    guildId: "guild-1",
    channelId: CENSOR3_VOTE_CHANNEL_ID,
    messageId: "message-1",
    requestRef: "workshop-request-1",
    eligibleRoleId: "role-1",
    subject: {
      kind: "CENSOR_3_MANUFACTURE_APPROVAL" as const,
      code: "ZULU_0028_CENSOR_3" as const,
      displayName: "ZULU-0028 파쇄음절탄 「CENSOR-3」",
      targetCharacterCodename: "네베드" as const,
      outputQuantity: 3 as const,
    },
    status: "OPEN" as const,
    ballots: {},
    publication: {
      state: "SENT" as const,
      sentAt: now,
      reconciliations: [],
    },
    closesAt: new Date("2026-08-06T13:00:00.000Z"),
    createdByDiscordUserId: "gm-1",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

test("CENSOR-3 투표 채널과 버튼 namespace는 사용자 지정값으로 고정된다", () => {
  assert.equal(CENSOR3_VOTE_CHANNEL_ID, "1534753076399833249");
  assert.equal(CRAFTING_VOTE_BUTTON_PREFIX, "registrar:craft-vote:");
});

test("동일 길드·요청참조는 결정적인 Mongo ID로 중복 생성을 차단한다", () => {
  const first = buildCraftingVoteLedgerId("guild-1", "request-1");
  const retry = buildCraftingVoteLedgerId("guild-1", "request-1");
  assert.equal(first, retry);
  assert.match(first, /^[a-f\d]{24}$/);
  assert.notEqual(first, buildCraftingVoteLedgerId("guild-1", "request-2"));
  assert.notEqual(first, buildCraftingVoteLedgerId("guild-2", "request-1"));
});

test("버튼 customId는 유효한 ObjectId와 yes/no만 허용한다", () => {
  const id = "507f1f77bcf86cd799439011";
  const yes = buildCraftingVoteButtonCustomId(id, "YES");
  assert.deepEqual(parseCraftingVoteButtonCustomId(yes), {
    voteId: id,
    choice: "YES",
  });
  assert.equal(
    parseCraftingVoteButtonCustomId(`${CRAFTING_VOTE_BUTTON_PREFIX}bad:yes`),
    null
  );
  assert.equal(
    parseCraftingVoteButtonCustomId(`${CRAFTING_VOTE_BUTTON_PREFIX}${id}:maybe`),
    null
  );
});

test("마감과 결론은 자동 승인 없이 명시적으로 분리된다", () => {
  const openVote = vote();
  assert.equal(
    getCraftingVotePhase(
      vote({ publication: { state: "DISPATCHING", reconciliations: [] } }),
      new Date("2026-08-06T12:30:00.000Z")
    ),
    "PUBLISH_PENDING"
  );
  assert.equal(
    getCraftingVotePhase(openVote, new Date("2026-08-06T12:59:59.999Z")),
    "OPEN"
  );
  assert.equal(
    getCraftingVotePhase(openVote, new Date("2026-08-06T13:00:00.000Z")),
    "CLOSED_PENDING_GM"
  );
  assert.equal(
    getCraftingVotePhase(
      vote({ status: "RESOLVED" }),
      new Date("2026-08-06T12:30:00.000Z")
    ),
    "RESOLVED"
  );
});

test("공식 길드·채널·메시지와 SENT 원장이 모두 일치해야 버튼 출처로 인정한다", () => {
  const canonical = vote();
  const source = {
    guildId: canonical.guildId,
    channelId: canonical.channelId,
    messageId: canonical.messageId,
  };
  assert.equal(isCanonicalCraftingVoteSource(canonical, source), true);
  assert.equal(
    isCanonicalCraftingVoteSource(canonical, { ...source, channelId: "wrong" }),
    false
  );
  assert.equal(
    isCanonicalCraftingVoteSource(canonical, { ...source, messageId: "wrong" }),
    false
  );
  assert.equal(
    isCanonicalCraftingVoteSource(
      vote({ publication: { state: "DISPATCHING", reconciliations: [] } }),
      source
    ),
    false
  );
});

test("SENT commit 응답 유실은 재조회로 성공 수렴하고 Discord 삭제 대상으로 분류하지 않는다", () => {
  const expected = { messageId: "message-1", operationKey: "operation-1" };
  assert.equal(
    classifyCraftingVotePublication(vote(), expected),
    "SENT_CONFIRMED"
  );
  assert.equal(
    classifyCraftingVotePublication(
      vote({
        messageId: "",
        publication: {
          state: "DISPATCHING",
          operationKey: "operation-1",
          reconciliations: [],
        },
      }),
      expected
    ),
    "NOT_SENT_CONFIRMED"
  );
  assert.equal(
    classifyCraftingVotePublication(
      vote({
        publication: {
          state: "DISPATCHING",
          operationKey: "different",
          reconciliations: [],
        },
      }),
      expected
    ),
    "UNKNOWN"
  );
  assert.equal(
    isCraftingVoteAnnouncementDeletionSafe(false, "NOT_SENT_CONFIRMED"),
    true
  );
  assert.equal(
    isCraftingVoteAnnouncementDeletionSafe(true, "NOT_SENT_CONFIRMED"),
    false
  );
  assert.equal(
    isCraftingVoteAnnouncementDeletionSafe(false, "SENT_CONFIRMED"),
    false
  );
});

test("동일 사용자 ballot map은 현재 선택만 집계한다", () => {
  const submittedAt = new Date("2026-08-06T12:10:00.000Z");
  const tally = countCraftingVoteBallots(
    vote({
      ballots: {
        user1: { choice: "YES", displayName: "A", submittedAt },
        user2: { choice: "NO", displayName: "B", submittedAt },
        user3: { choice: "YES", displayName: "C", submittedAt },
      },
    })
  );
  assert.deepEqual(tally, { yes: 2, no: 1, total: 3 });
});

test("ballot 기록은 OPEN·마감 전 조건과 사용자별 map 갱신을 단일 Mongo 연산에 둔다", async () => {
  const source = await readFile(
    new URL("../src/db/crafting-votes.ts", import.meta.url),
    "utf8"
  );
  const start = source.indexOf("export async function recordCraftingVoteBallot");
  const end = source.indexOf("export async function resolveCraftingVote");
  const implementation = source.slice(start, end);

  assert.match(implementation, /status: "OPEN"/);
  assert.match(implementation, /closesAt: \{ \$gt: input\.submittedAt \}/);
  assert.match(implementation, /"publication\.state": "SENT"/);
  assert.match(implementation, /const ballotPath = `ballots\.\$\{input\.discordUserId\}`/);
  assert.match(implementation, /\$inc: \{ revision: 1 \}/);
  assert.match(implementation, /findOneAndUpdate\(filter, update/);
});

test("결론 receipt는 ERP·크레딧·인벤토리 자동 mutation을 명시적으로 금지한다", () => {
  const resolvedAt = new Date("2026-08-06T13:05:00.000Z");
  const receipt = buildCraftingVoteResolutionReceipt(
    vote({
      status: "RESOLVED",
      ballots: {
        user1: {
          choice: "YES",
          displayName: "A",
          submittedAt: new Date("2026-08-06T12:10:00.000Z"),
        },
      },
      resolution: {
        outcome: "DEFERRED",
        reason: "동률·무투표 처리 기준 미확정",
        resolvedByDiscordUserId: "gm-1",
        resolvedAt,
      },
    })
  );

  assert.ok(receipt);
  assert.equal(receipt.schema, "registrar.crafting-vote-resolution.v1");
  assert.equal(receipt.resolution.outcome, "DEFERRED");
  assert.deepEqual(receipt.tally, { yes: 1, no: 0, total: 1 });
  assert.deepEqual(receipt.execution, {
    mode: "MANUAL_GM_REVIEW_REQUIRED",
    automaticallyApproved: false,
    erpMutationsPerformed: false,
    creditMutationsPerformed: false,
    inventoryMutationsPerformed: false,
  });
  assert.deepEqual(receipt.source, {
    collection: "registrar_crafting_votes",
    schemaVersion: 1,
    revision: 0,
    createdByDiscordUserId: "gm-1",
    createdAt: "2026-08-06T12:00:00.000Z",
    publicationState: "SENT",
  });
  assert.equal(receipt.verification.receiptIsAuthoritative, false);
  assert.equal(
    receipt.verification.requiredMethod,
    "REQUERY_REGISTRAR_LEDGER"
  );
  assert.equal(receipt.verification.lookup.voteId, "507f1f77bcf86cd799439011");
});

test("슬래시 명령은 마감·역할·참조를 요구하고 자동 판정 옵션을 노출하지 않는다", () => {
  const create = CRAFTING_VOTE_CMD.options.find((option) => option.name === "생성");
  const resolve = CRAFTING_VOTE_CMD.options.find((option) => option.name === "결론");
  const reconcile = CRAFTING_VOTE_CMD.options.find(
    (option) => option.name === "게시복구"
  );
  assert.ok(create);
  assert.ok(resolve);
  assert.ok(reconcile);
  assert.deepEqual(
    create.options.map((option) => [option.name, option.required]),
    [
      ["요청참조", true],
      ["응답마감", true],
      ["투표역할", true],
    ]
  );
  assert.deepEqual(
    resolve.options.map((option) => [option.name, option.required]),
    [
      ["투표아이디", true],
      ["결론", true],
      ["사유", true],
    ]
  );
  const serialized = JSON.stringify(CRAFTING_VOTE_CMD);
  assert.doesNotMatch(serialized, /threshold|quorum|자동승인|통과기준/i);
});

test("RESOLVED 현황은 결정적 receipt 재발급 경로를 유지한다", async () => {
  const source = await readFile(
    new URL("../src/commands/crafting-vote.ts", import.meta.url),
    "utf8"
  );
  const start = source.indexOf("async function handleStatus");
  const end = source.indexOf("function parseOutcome");
  const implementation = source.slice(start, end);
  assert.match(implementation, /buildReceiptAttachment\(vote\)/);
  assert.match(implementation, /files: receipt \? \[receipt\] : \[\]/);
});

test("게시 saga는 PENDING claim과 DISPATCHING 불확실 상태를 자동 재전송하지 않는다", async () => {
  const source = await readFile(
    new URL("../src/commands/crafting-vote.ts", import.meta.url),
    "utf8"
  );
  const start = source.indexOf("async function handleCreate");
  const end = source.indexOf("async function handleStatus");
  const implementation = source.slice(start, end);
  assert.match(implementation, /claimCraftingVotePublication/);
  assert.match(implementation, /publication\.state === "DISPATCHING"/);
  assert.match(implementation, /자동 재전송하지 않습니다/);
  assert.match(implementation, /releaseCraftingVotePublicationAfterConfirmedDelete/);
});

test("SENT mark 결과가 모호하면 원장을 재조회하고 확인 전 공지를 삭제하지 않는다", async () => {
  const source = await readFile(
    new URL("../src/commands/crafting-vote.ts", import.meta.url),
    "utf8"
  );
  const persistStart = source.indexOf("async function persistCraftingVotePublication");
  const persistEnd = source.indexOf("async function refreshCraftingVoteMessage");
  const persist = source.slice(persistStart, persistEnd);
  assert.match(persist, /findCraftingVoteById/);
  assert.match(persist, /classifyCraftingVotePublication/);
  assert.match(persist, /SENT_CONFIRMED/);
  assert.match(persist, /isCraftingVoteAnnouncementDeletionSafe/);
  assert.match(persist, /safeToDeleteAnnouncement: false/);

  const createStart = source.indexOf("async function handleCreate");
  const createEnd = source.indexOf("async function handleStatus");
  const create = source.slice(createStart, createEnd);
  assert.match(create, /announcement && safeToDeleteAnnouncement/);
});

test("동시 ballot 화면 보정은 monotonic revision을 edit 뒤 재확인한다", async () => {
  const source = await readFile(
    new URL(
      "../src/handlers/crafting-vote-button-handler.ts",
      import.meta.url
    ),
    "utf8"
  );
  const start = source.indexOf("let renderVote = updated");
  const implementation = source.slice(start, start + 1_300);
  assert.match(implementation, /attempt < 5/);
  assert.match(implementation, /interaction\.message\.edit/);
  assert.match(implementation, /findCraftingVoteById/);
  assert.match(implementation, /latest\.revision === renderVote\.revision/);
  assert.match(implementation, /renderVote = latest/);
  assert.ok(
    implementation.indexOf("interaction.message.edit") <
      implementation.indexOf("findCraftingVoteById")
  );
});
