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
  decideCraftingVoteMajority,
  getCraftingVotePhase,
  isCanonicalCraftingVoteSource,
  isCraftingVoteAnnouncementDeletionSafe,
  parseCraftingVoteButtonCustomId,
} = await import("../src/services/crafting-vote.js");
const {
  CENSOR3_VOTE_CHANNEL_ID,
  CENSOR_USE_VOTE_BUTTON_PREFIX,
} = await import("../src/constants/registrar.js");
const { CRAFTING_VOTE_CMD } = await import("../src/commands/register.js");

function vote(overrides: Record<string, unknown> = {}) {
  const now = new Date("2026-08-06T12:00:00.000Z");
  return {
    _id: new ObjectId("507f1f77bcf86cd799439011"),
    schemaVersion: 2 as const,
    revision: 0,
    guildId: "guild-1",
    channelId: CENSOR3_VOTE_CHANNEL_ID,
    messageId: "message-1",
    requestRef: "censor-use-1",
    eligibleRoleId: "role-1",
    subject: {
      kind: "CENSOR_3_USE_APPROVAL" as const,
      code: "ZULU_0028_CENSOR_3" as const,
      displayName: "ZULU-0028 파쇄음절탄 「CENSOR-3」",
      targetCharacterCodename: "네베드" as const,
      usageQuantity: 1 as const,
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
  assert.equal(
    CENSOR_USE_VOTE_BUTTON_PREFIX,
    "registrar:censor-use-vote:v2:"
  );
});

test("v2 사용 투표 DB 접근은 schemaVersion과 고정 subject guard를 항상 포함한다", async () => {
  const source = await readFile(
    new URL("../src/db/crafting-votes.ts", import.meta.url),
    "utf8"
  );
  assert.match(source, /const CENSOR_USE_VOTE_GUARD = \{/);
  assert.match(source, /schemaVersion: 2/);
  assert.match(source, /"subject\.kind": "CENSOR_3_USE_APPROVAL"/);
  assert.match(source, /"subject\.code": "ZULU_0028_CENSOR_3"/);
  assert.match(
    source,
    /return \{[\s\S]*_id: new ObjectId\(voteId\)[\s\S]*\.\.\.CENSOR_USE_VOTE_GUARD/,
  );
  assert.match(
    source,
    /\{ _id: doc\._id, \.\.\.CENSOR_USE_VOTE_GUARD \}/,
  );
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
    parseCraftingVoteButtonCustomId(`${CENSOR_USE_VOTE_BUTTON_PREFIX}bad:yes`),
    null
  );
  assert.equal(
    parseCraftingVoteButtonCustomId(`${CENSOR_USE_VOTE_BUTTON_PREFIX}${id}:maybe`),
    null
  );
  assert.equal(
    parseCraftingVoteButtonCustomId(`registrar:craft-vote:${id}:yes`),
    null,
    "legacy v1 manufacture vote buttons must be rejected",
  );
});

test("마감과 유효표 과반 판정 단계는 명시적으로 분리된다", () => {
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
    "CLOSED_PENDING_RESOLUTION"
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

test("유효표 과반만 승인하며 동률과 무투표는 반려한다", () => {
  const submittedAt = new Date("2026-08-06T12:10:00.000Z");
  assert.deepEqual(
    decideCraftingVoteMajority(
      vote({
        ballots: {
          user1: { choice: "YES", displayName: "A", submittedAt },
          user2: { choice: "NO", displayName: "B", submittedAt },
          user3: { choice: "YES", displayName: "C", submittedAt },
        },
      }),
    ),
    {
      outcome: "APPROVED",
      reason: "유효표 과반 찬성 (2/3)",
      tally: { yes: 2, no: 1, total: 3 },
    },
  );
  assert.equal(
    decideCraftingVoteMajority(
      vote({
        ballots: {
          user1: { choice: "YES", displayName: "A", submittedAt },
          user2: { choice: "NO", displayName: "B", submittedAt },
        },
      }),
    ).outcome,
    "REJECTED",
  );
  assert.deepEqual(decideCraftingVoteMajority(vote()).tally, {
    yes: 0,
    no: 0,
    total: 0,
  });
  assert.equal(decideCraftingVoteMajority(vote()).outcome, "REJECTED");
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

test("과반 승인 receipt는 ERP의 1회 사용 claim 대기 상태를 명시한다", () => {
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
        outcome: "APPROVED",
        reason: "유효표 과반 찬성 (1/1)",
        rule: "CAST_BALLOT_MAJORITY",
        tally: { yes: 1, no: 0, total: 1 },
        resolvedByDiscordUserId: "gm-1",
        resolvedAt,
      },
    })
  );

  assert.ok(receipt);
  assert.equal(receipt.schema, "registrar.censor-use-vote-resolution.v2");
  assert.equal(receipt.resolution.outcome, "APPROVED");
  assert.deepEqual(receipt.tally, { yes: 1, no: 0, total: 1 });
  assert.deepEqual(receipt.execution, {
    mode: "APPROVED_USE_AVAILABLE",
    automaticallyResolved: true,
    erpMutationsPerformed: false,
    creditMutationsPerformed: false,
    inventoryMutationsPerformed: false,
  });
  assert.deepEqual(receipt.source, {
    collection: "registrar_crafting_votes",
    schemaVersion: 2,
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

test("사용투표 명령은 마감·역할·참조를 요구하고 결론 수동 덮어쓰기를 노출하지 않는다", () => {
  assert.equal(CRAFTING_VOTE_CMD.name, "사용투표");
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
    [["투표아이디", true]],
  );
  const serialized = JSON.stringify(CRAFTING_VOTE_CMD);
  assert.doesNotMatch(serialized, /DEFERRED|수동 결론|보류/);
  assert.match(serialized, /과반/);
  assert.match(serialized, /표적·세션과는 결합하지 않습니다/);
});

test("RESOLVED 현황은 결정적 receipt 재발급 경로를 유지한다", async () => {
  const source = await readFile(
    new URL("../src/commands/crafting-vote.ts", import.meta.url),
    "utf8"
  );
  const start = source.indexOf("async function handleStatus");
  const end = source.indexOf("async function handleResolve");
  const implementation = source.slice(start, end);
  assert.match(implementation, /buildReceiptAttachment\(vote\)/);
  assert.match(implementation, /files: receipt \? \[receipt\] : \[\]/);
});

test("결론 명령은 마감 뒤 유효표 과반 결과만 DB에 기록한다", async () => {
  const [commandSource, dbSource] = await Promise.all([
    readFile(new URL("../src/commands/crafting-vote.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/db/crafting-votes.ts", import.meta.url), "utf8"),
  ]);
  const command = commandSource.slice(
    commandSource.indexOf("async function handleResolve"),
    commandSource.indexOf("function messageHasCraftingVoteButtons"),
  );
  assert.match(command, /decideCraftingVoteMajority\(before\)/);
  assert.match(command, /expectedRevision: before\.revision/);
  assert.match(command, /outcome: decision\.outcome/);
  assert.match(command, /tally: decision\.tally/);
  assert.doesNotMatch(command, /getString\(CraftingVoteOpt\.outcome/);

  const resolution = dbSource.slice(
    dbSource.indexOf("export async function resolveCraftingVote"),
  );
  assert.match(resolution, /closesAt: \{ \$lte: input\.resolvedAt \}/);
  assert.match(resolution, /revision: input\.expectedRevision/);
  assert.match(resolution, /rule: "CAST_BALLOT_MAJORITY"/);
  assert.match(resolution, /tally: input\.tally/);
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
