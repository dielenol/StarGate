import test from "node:test";
import assert from "node:assert/strict";
import { MessageFlags, PermissionFlagsBits } from "discord.js";

import { applyTestEnv } from "./helpers/test-env.mjs";

applyTestEnv();

const {
  SchedulePollInputError,
  buildSchedulePollResultMessage,
  formatScheduleCandidate,
  parseScheduleCandidate,
  parseScheduleCandidates,
  pickSchedulePollWinner,
} = await import("../dist/services/schedule-poll.js");
const { handleSchedulePoll } = await import("../dist/commands/schedule-poll.js");

const TODAY = "2026-10-22";
/** 2026-10-22 12:00 KST */
const NOW = Date.UTC(2026, 9, 22, 3, 0, 0);

test("후보 날짜는 연도 생략·슬래시·시각 표기를 받고, 연도가 없으면 지난 날짜를 내년으로 본다", () => {
  assert.deepEqual(parseScheduleCandidate("2026-11-08", { todayKey: TODAY, defaultTime: null }), {
    dateKey: "2026-11-08",
    time: null,
  });
  assert.deepEqual(parseScheduleCandidate("11/8 20:00", { todayKey: TODAY, defaultTime: null }), {
    dateKey: "2026-11-08",
    time: "20:00",
  });
  assert.deepEqual(parseScheduleCandidate("1-5", { todayKey: TODAY, defaultTime: "19:30" }), {
    dateKey: "2027-01-05",
    time: "19:30",
  });
});

test("존재하지 않거나 지난 날짜, 잘못된 형식은 거부한다", () => {
  const options = { todayKey: TODAY, defaultTime: null };
  assert.throws(() => parseScheduleCandidate("2026-02-30", options), /존재하지 않는 날짜/);
  assert.throws(() => parseScheduleCandidate("2026-10-01", options), /이미 지난 날짜/);
  assert.throws(() => parseScheduleCandidate("다음 주 토요일", options), SchedulePollInputError);
  assert.throws(() => parseScheduleCandidate("11-08 25:00", options), /올바른 시각/);
});

test("후보는 중복을 빼고 시간순으로 정렬하며 2-10개만 허용한다", () => {
  const candidates = parseScheduleCandidates(
    ["11-15", "11-08", "2026-11-08", ""],
    { todayKey: TODAY, defaultTime: "20:00" },
  );
  assert.deepEqual(
    candidates.map((candidate) => `${candidate.dateKey} ${candidate.time}`),
    ["2026-11-08 20:00", "2026-11-15 20:00"],
  );
  assert.throws(
    () => parseScheduleCandidates(["11-08", "2026-11-08"], { todayKey: TODAY, defaultTime: null }),
    /2개 이상/,
  );
  assert.throws(
    () => parseScheduleCandidates(["11-08", "11-15"], { todayKey: TODAY, defaultTime: "8시" }),
    /HH:mm/,
  );
});

test("투표 답변은 월/일(요일) 시각으로 표시한다", () => {
  assert.equal(formatScheduleCandidate({ dateKey: "2026-11-08", time: "20:00" }), "11/08(일) 20:00");
  assert.equal(formatScheduleCandidate({ dateKey: "2026-11-14", time: null }), "11/14(토)");
});

test("가장 많은 표를 받은 날짜를 고르고 동률이면 이른 날짜를 고른다", () => {
  const candidates = [
    { dateKey: "2026-11-08", time: "20:00" },
    { dateKey: "2026-11-15", time: "20:00" },
    { dateKey: "2026-11-22", time: "20:00" },
  ];
  assert.deepEqual(pickSchedulePollWinner(candidates, [1, 4, 2]), {
    candidate: candidates[1],
    votes: 4,
    tiedCount: 1,
  });
  assert.deepEqual(pickSchedulePollWinner(candidates, [3, 3, 1]), {
    candidate: candidates[0],
    votes: 3,
    tiedCount: 2,
  });
  assert.equal(pickSchedulePollWinner(candidates, [0, 0, 0]), null);
});

test("결과 답장은 승자와 그 날짜로 열리는 웹 캘린더 링크를 미리보기 없이 싣는다", () => {
  const message = buildSchedulePollResultMessage({
    title: "다음 세션 날짜 투표",
    winner: {
      candidate: { dateKey: "2026-11-08", time: "20:00" },
      votes: 3,
      tiedCount: 2,
    },
    baseUrl: "https://example.test",
  });
  assert.match(message, /\*\*11\/08\(일\) 20:00\*\* \(3표 — 동률 2개 중 가장 이른 날짜\)/);
  assert.match(message, /<https:\/\/example\.test\/calendar\?date=2026-11-08>/);

  assert.match(
    buildSchedulePollResultMessage({ title: "투표", winner: null, baseUrl: "https://example.test" }),
    /참여한 표가 없어/,
  );
});

function pollInteraction(
  values = {},
  { canSendPolls = true, memberCanSendPolls = true, isThread = false } = {},
) {
  const replies = [];
  const botPermissionChecks = [];
  const interaction = {
    guildId: "test-guild-id",
    inGuild: () => true,
    appPermissions: {
      has: (required) => {
        botPermissionChecks.push(required);
        return canSendPolls;
      },
    },
    memberPermissions: { has: () => memberCanSendPolls },
    channel: { isThread: () => isThread },
    user: { id: "user-1", username: "user-1", globalName: null },
    member: { displayName: "마스터" },
    client: {},
    options: {
      getString: (name) => values[name] ?? null,
      getInteger: (name) => values[name] ?? null,
      getBoolean: (name) => values[name] ?? null,
    },
    async reply(payload) {
      replies.push(payload);
      return {
        resource: {
          message: { id: "poll-message", channelId: "channel-1", poll: { expiresTimestamp: NOW + 3_600_000 } },
        },
      };
    },
  };
  return { interaction, replies, botPermissionChecks };
}

test("봇 권한(투표 만들기·채널 보기·기록 보기·메시지 보내기)이 없으면 투표를 열지 않고 비공개로 안내한다", async () => {
  const { interaction, replies, botPermissionChecks } = pollInteraction(
    { 날짜1: "11-08", 날짜2: "11-15" },
    { canSendPolls: false },
  );
  await handleSchedulePoll(interaction, { now: () => NOW, scheduleFinalization: () => assert.fail() });
  assert.equal(replies[0].flags, MessageFlags.Ephemeral);
  assert.match(replies[0].content, /투표 만들기/);
  assert.equal(replies[0].poll, undefined);
  assert.deepEqual(botPermissionChecks[0], [
    PermissionFlagsBits.SendPolls,
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.SendMessages,
  ]);

  const thread = pollInteraction({ 날짜1: "11-08", 날짜2: "11-15" }, { canSendPolls: false, isThread: true });
  await handleSchedulePoll(thread.interaction, { now: () => NOW, scheduleFinalization: () => assert.fail() });
  assert.equal(
    thread.botPermissionChecks[0][3],
    PermissionFlagsBits.SendMessagesInThreads,
    "스레드에서는 스레드 메시지 보내기 권한을 본다",
  );
});

test("명령을 쓴 멤버에게 투표 만들기 권한이 없으면 비공개로 거절한다", async () => {
  const { interaction, replies } = pollInteraction(
    { 날짜1: "11-08", 날짜2: "11-15" },
    { memberCanSendPolls: false },
  );
  await handleSchedulePoll(interaction, { now: () => NOW, scheduleFinalization: () => assert.fail() });
  assert.equal(replies[0].flags, MessageFlags.Ephemeral);
  assert.equal(replies[0].content, "이 채널에서 투표를 만들 권한이 없습니다.");
  assert.equal(replies[0].poll, undefined);
});

test("후보 입력이 잘못되면 비공개로 사유를 알린다", async () => {
  const { interaction, replies } = pollInteraction({ 날짜1: "11-08", 날짜2: "2026-10-01" });
  await handleSchedulePoll(interaction, { now: () => NOW, scheduleFinalization: () => assert.fail() });
  assert.equal(replies[0].flags, MessageFlags.Ephemeral);
  assert.match(replies[0].content, /이미 지난 날짜/);
});

test("후보 날짜로 Discord 투표를 열고 마감 결과 답장을 예약한다", async () => {
  const { interaction, replies } = pollInteraction({
    날짜1: "11-15",
    날짜2: "11-08",
    날짜3: "11-22 19:00",
    시각: "20:00",
    제목: "12월 캠페인 첫 세션",
    마감: 24,
    복수선택: false,
  });
  const jobs = [];
  await handleSchedulePoll(interaction, {
    now: () => NOW,
    scheduleFinalization: (_client, job, options) => jobs.push({ job, options }),
  });

  const [reply] = replies;
  assert.equal(reply.flags, undefined, "투표는 채널에 공개로 연다");
  assert.match(reply.content, /봇이 재시작되면 결과 답장이 빠질 수 있습니다/);
  assert.equal(reply.poll.question.text, "12월 캠페인 첫 세션");
  assert.deepEqual(
    reply.poll.answers.map((answer) => answer.text),
    ["11/08(일) 20:00", "11/15(일) 20:00", "11/22(일) 19:00"],
  );
  assert.equal(reply.poll.duration, 24);
  assert.equal(reply.poll.allowMultiselect, false);
  assert.deepEqual(reply.allowedMentions, { parse: [] });

  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].job.messageId, "poll-message");
  assert.equal(jobs[0].job.expiresAt, NOW + 3_600_000);
  assert.equal(jobs[0].job.candidates[0].dateKey, "2026-11-08");
  assert.equal(jobs[0].options.baseUrl, "https://example.test");
});
