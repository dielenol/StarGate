import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ObjectId } from "mongodb";

process.env.DISCORD_TOKEN ??= "test-token";
process.env.DISCORD_CLIENT_ID ??= "test-client";
process.env.MONGODB_URI ??= "mongodb://127.0.0.1:27017/test";

const shared = await import("@stargate/shared-db");
const service = await import("../src/services/bureaucrat-vote.js");
const view = await import("../src/utils/bureaucrat-vote-view.js");
const { BUREAUCRAT_VOTE_CMD } = await import("../src/commands/register.js");

function vote(overrides: Record<string, unknown> = {}) {
  const createdAt = new Date("2026-08-07T00:00:00.000Z");
  return {
    _id: new ObjectId("507f1f77bcf86cd799439011"),
    schemaVersion: 1 as const,
    revision: 2,
    requestKey: "discord:guild:interaction",
    source: "DISCORD_COMMAND" as const,
    guildId: "guild-1",
    channelId: shared.BUREAUCRAT_VOTE_CHANNEL_ID,
    title: "표결 안건",
    content: "판단에 필요한 안건 내용입니다.",
    status: "OPEN" as const,
    ballots: {},
    publication: {
      state: "SENT" as const,
      attempts: 1,
      messageId: "message-1",
      sentAt: createdAt,
    },
    closesAt: new Date(createdAt.getTime() + shared.BUREAUCRAT_VOTE_DURATION_MS),
    createdBy: {
      kind: "DISCORD_USER" as const,
      id: "user-1",
      displayName: "관료 1",
    },
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

test("관료 표결 채널·기간·버튼 namespace는 고정 계약이다", () => {
  assert.equal(shared.BUREAUCRAT_VOTE_CHANNEL_ID, "1534753076399833249");
  assert.equal(shared.BUREAUCRAT_VOTE_DURATION_MS, 6 * 60 * 60 * 1000);
  assert.equal(
    shared.BUREAUCRAT_VOTE_BUTTON_PREFIX,
    "registrar:bureaucrat-vote:v1:",
  );
});

test("/관료투표는 생성 하나와 제목·내용 두 옵션만 노출한다", () => {
  assert.equal(BUREAUCRAT_VOTE_CMD.name, "관료투표");
  assert.equal(BUREAUCRAT_VOTE_CMD.options.length, 1);
  assert.equal(BUREAUCRAT_VOTE_CMD.options[0]?.name, "생성");
  assert.deepEqual(
    BUREAUCRAT_VOTE_CMD.options[0]?.options.map((option) => option.name),
    ["안건제목", "안건내용"],
  );
  const serialized = JSON.stringify(BUREAUCRAT_VOTE_CMD);
  assert.doesNotMatch(serialized, /현황|결론|복구|응답마감|투표역할|요청참조/);
});

test("버튼 customId는 찬성·반대·종료만 파싱한다", () => {
  const id = "507f1f77bcf86cd799439011";
  for (const action of ["YES", "NO", "CLOSE"] as const) {
    const customId = service.buildBureaucratVoteButtonCustomId(id, action);
    assert.deepEqual(service.parseBureaucratVoteButtonCustomId(customId), {
      voteId: id,
      action,
    });
  }
  assert.equal(
    service.parseBureaucratVoteButtonCustomId(
      `${shared.BUREAUCRAT_VOTE_BUTTON_PREFIX}${id}:status`,
    ),
    null,
  );
});

test("6시간 경계에서 표결 단계가 닫힌다", () => {
  const open = vote();
  assert.equal(
    service.getBureaucratVotePhase(open, new Date("2026-08-07T05:59:59.999Z")),
    "OPEN",
  );
  assert.equal(
    service.getBureaucratVotePhase(open, new Date("2026-08-07T06:00:00.000Z")),
    "CLOSED",
  );
  assert.equal(
    service.getBureaucratVotePhase(
      vote({ publication: { state: "PENDING", attempts: 0 } }),
      new Date("2026-08-07T01:00:00.000Z"),
    ),
    "PUBLISH_PENDING",
  );
});

test("유효표 과반만 가결하며 동률·무투표는 부결한다", () => {
  const at = new Date("2026-08-07T01:00:00.000Z");
  assert.equal(shared.decideBureaucratVoteMajority(vote()).outcome, "REJECTED");
  assert.equal(
    shared.decideBureaucratVoteMajority(
      vote({
        ballots: {
          a: { choice: "YES", displayName: "A", submittedAt: at },
          b: { choice: "NO", displayName: "B", submittedAt: at },
        },
      }),
    ).outcome,
    "REJECTED",
  );
  assert.equal(
    shared.decideBureaucratVoteMajority(
      vote({
        ballots: {
          a: { choice: "YES", displayName: "A", submittedAt: at },
          b: { choice: "YES", displayName: "B", submittedAt: at },
          c: { choice: "NO", displayName: "C", submittedAt: at },
        },
      }),
    ).outcome,
    "APPROVED",
  );
});

test("공식 원장의 길드·채널·메시지가 모두 일치해야 버튼을 인정한다", () => {
  const current = vote();
  const source = {
    guildId: current.guildId,
    channelId: current.channelId,
    messageId: current.publication.messageId!,
  };
  assert.equal(service.isCanonicalBureaucratVoteSource(current, source), true);
  assert.equal(
    service.isCanonicalBureaucratVoteSource(current, {
      ...source,
      messageId: "forged",
    }),
    false,
  );
});

test("공지에는 관료 안내·상태·3개 버튼·6시간 규칙이 표시된다", () => {
  const message = view.buildBureaucratVoteMessage(vote());
  assert.match(message.content, /사무국 심의 안건/);
  const embed = message.embeds[0]!.toJSON();
  assert.match(embed.title ?? "", /관료 표결/);
  assert.match(embed.footer?.text ?? "", /동률·무투표 부결/);
  assert.match(embed.footer?.text ?? "", /6시간/);
  const components = message.components[0]!.toJSON().components;
  assert.deepEqual(
    components.map((component) => "label" in component ? component.label : undefined),
    ["찬성", "반대", "투표 종료"],
  );
});

test("명령 런타임은 관료 채널을 강제하고 구 사용투표 라우팅을 제거한다", async () => {
  const [command, index, names] = await Promise.all([
    readFile(new URL("../src/commands/bureaucrat-vote.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/slash/ko-names.ts", import.meta.url), "utf8"),
  ]);
  assert.match(command, /interaction\.channelId !== BUREAUCRAT_VOTE_CHANNEL_ID/);
  assert.match(index, /BUREAUCRAT_VOTE_ROOT/);
  assert.doesNotMatch(`${index}\n${names}`, /사용투표|CRAFTING_VOTE_ROOT/);
});

test("게시 재시도는 전송 성공 불확실 상태를 PENDING으로 되돌리지 않는다", async () => {
  const runtime = await readFile(
    new URL("../src/services/bureaucrat-vote-runtime.ts", import.meta.url),
    "utf8",
  );
  assert.match(runtime, /findExistingVoteMessage/);
  assert.match(runtime, /vote\.publication\.attempts > 1/);
  const uncertainStart = runtime.lastIndexOf("const marked = await markSentWithRetry");
  const uncertain = runtime.slice(uncertainStart, uncertainStart + 700);
  assert.doesNotMatch(uncertain, /releaseBureaucratVotePublication/);
  assert.match(runtime, /const announcementVote:[\s\S]*state: "SENT"/);
  assert.match(runtime, /channel\.send\(buildBureaucratVoteMessage\(announcementVote\)\)/);
});

test("기한이 지난 게시 lease는 기존 공지만 복구하고 새로 발송하지 않는다", async () => {
  const [crud, runtime, checker] = await Promise.all([
    readFile(
      new URL("../../packages/shared-db/src/crud/bureaucrat-votes.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/services/bureaucrat-vote-runtime.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/scheduler/bureaucrat-vote-checker.ts", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(
    crud,
    /"publication\.state": "DISPATCHING",\s+"publication\.leaseUntil": \{ \$lte: now \}/,
  );
  assert.match(
    runtime,
    /if \(vote\.closesAt\.getTime\(\) <= Date\.now\(\)\)[\s\S]*releaseBureaucratVotePublication[\s\S]*return null;/,
  );
  assert.match(
    checker,
    /await publishPendingBureaucratVotes\(client\);\s+await closeDueBureaucratVotes\(client\);/,
  );
});

test("표결 원장은 경제·인벤토리 mutation을 포함하지 않는다", async () => {
  const crud = await readFile(
    new URL("../../packages/shared-db/src/crud/bureaucrat-votes.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(crud, /creditTransactionsCol|characterInventoryCol|sharedInventoryCol/);
});

test("Discord 게시 lease가 진행 중인 원장은 마감과 경합하지 않는다", async () => {
  const crud = await readFile(
    new URL("../../packages/shared-db/src/crud/bureaucrat-votes.ts", import.meta.url),
    "utf8",
  );
  const closeStart = crud.indexOf("export async function closeBureaucratVote(");
  const closeContract = crud.slice(closeStart, closeStart + 1_400);
  assert.ok(closeStart >= 0);
  assert.match(
    closeContract,
    /"publication\.state": \{ \$ne: "DISPATCHING" \}/,
  );
});
