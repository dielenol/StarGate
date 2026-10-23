/**
 * `/일정투표` 후보 해석·결과 집계·마감 처리
 *
 * 후보 날짜를 검증해 Discord 기본 투표(Poll)의 답변으로 만들고, 투표가 끝나면 가장
 * 많은 표를 받은 날짜(동률이면 이른 날짜)와 그 날짜로 열리는 웹 캘린더 링크를 투표
 * 메시지에 답장한다. 세션 생성은 하지 않는다 — 마스터가 trpg-web 에서 확정한다.
 *
 * 마감 처리 예약은 프로세스 메모리 타이머다. 봇이 마감 전에 재시작하면 결과 답장은
 * 빠지지만, Discord 가 직접 올리는 투표 종료 안내는 그대로 남는다.
 *
 * @module services/schedule-poll
 */

import type { Client } from "discord.js";

import { formatKstMonthDayWeekday } from "../utils/kst.js";

export const MIN_SCHEDULE_CANDIDATES = 2;
export const MAX_SCHEDULE_CANDIDATES = 10;
export const DEFAULT_POLL_DURATION_HOURS = 48;
export const MAX_POLL_DURATION_HOURS = 168;
const POLL_ANSWER_TEXT_MAX = 55;
/** 마감 직후에는 집계가 확정되지 않았을 수 있어 조금 기다렸다 다시 읽는다 */
const FINALIZE_GRACE_MS = 5_000;
const FINALIZE_RETRY_MS = 30_000;
const FINALIZE_MAX_RETRIES = 3;
const UNKNOWN_MESSAGE_CODE = 10_008;

export class SchedulePollInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchedulePollInputError";
  }
}

export interface ScheduleCandidate {
  /** `YYYY-MM-DD` (KST) */
  dateKey: string;
  /** `HH:mm` 또는 시각 미정 */
  time: string | null;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= lastDay;
}

function parseTime(raw: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!match) {
    throw new SchedulePollInputError(`시각은 HH:mm 형식으로 입력해 주세요: '${raw}'`);
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) {
    throw new SchedulePollInputError(`올바른 시각이 아닙니다: '${raw}'`);
  }
  return `${pad2(hour)}:${pad2(minute)}`;
}

/**
 * 후보 하나를 해석한다. `2026-11-08`, `11-08`, `11/8`, `11-08 20:00` 형태를 받는다.
 * 연도가 없으면 올해(KST)로 보고, 그 날짜가 이미 지났으면 내년으로 본다.
 */
export function parseScheduleCandidate(
  raw: string,
  {
    todayKey,
    defaultTime,
  }: { todayKey: string; defaultTime: string | null },
): ScheduleCandidate {
  const match =
    /^(?:(\d{4})[-/.])?(\d{1,2})[-/.](\d{1,2})(?:\s+(\d{1,2}:\d{2}))?$/.exec(
      raw.trim(),
    );
  if (!match) {
    throw new SchedulePollInputError(
      `날짜는 \`2026-11-08\`, \`11-08\`, \`11-08 20:00\` 형식으로 입력해 주세요: '${raw}'`,
    );
  }
  const [, yearText, monthText, dayText, timeText] = match;
  const todayYear = Number(todayKey.slice(0, 4));
  const month = Number(monthText);
  const day = Number(dayText);
  let year = yearText ? Number(yearText) : todayYear;
  if (!yearText && `${year}-${pad2(month)}-${pad2(day)}` < todayKey) year += 1;

  if (!isValidCalendarDate(year, month, day)) {
    throw new SchedulePollInputError(`존재하지 않는 날짜입니다: '${raw}'`);
  }
  const dateKey = `${year}-${pad2(month)}-${pad2(day)}`;
  if (dateKey < todayKey) {
    throw new SchedulePollInputError(`이미 지난 날짜입니다: '${raw}'`);
  }
  return {
    dateKey,
    time: timeText ? parseTime(timeText) : defaultTime,
  };
}

/** 후보들을 해석해 중복을 빼고 시간순으로 정렬한다. 2-10개만 허용. */
export function parseScheduleCandidates(
  rawValues: readonly string[],
  { todayKey, defaultTime }: { todayKey: string; defaultTime: string | null },
): ScheduleCandidate[] {
  const time = defaultTime ? parseTime(defaultTime) : null;
  const unique = new Map<string, ScheduleCandidate>();
  for (const raw of rawValues) {
    if (!raw.trim()) continue;
    const candidate = parseScheduleCandidate(raw, { todayKey, defaultTime: time });
    unique.set(`${candidate.dateKey} ${candidate.time ?? ""}`, candidate);
  }
  const candidates = [...unique.values()].sort((a, b) =>
    `${a.dateKey} ${a.time ?? ""}`.localeCompare(`${b.dateKey} ${b.time ?? ""}`),
  );
  if (candidates.length < MIN_SCHEDULE_CANDIDATES) {
    throw new SchedulePollInputError("서로 다른 후보 날짜를 2개 이상 입력해 주세요.");
  }
  if (candidates.length > MAX_SCHEDULE_CANDIDATES) {
    throw new SchedulePollInputError(
      `후보 날짜는 최대 ${MAX_SCHEDULE_CANDIDATES}개까지 넣을 수 있습니다.`,
    );
  }
  return candidates;
}

/** 투표 답변 문구 — `11/08(토) 20:00` */
export function formatScheduleCandidate(candidate: ScheduleCandidate): string {
  const label = `${formatKstMonthDayWeekday(candidate.dateKey)}${candidate.time ? ` ${candidate.time}` : ""}`;
  return label.slice(0, POLL_ANSWER_TEXT_MAX);
}

export interface SchedulePollWinner {
  candidate: ScheduleCandidate;
  votes: number;
  /** 같은 최다 득표를 받은 후보 수 (1이면 단독) */
  tiedCount: number;
}

/**
 * 답변 순서(= 후보 순서)별 득표로 승자를 고른다. 동률이면 이른 날짜, 표가 없으면 null.
 */
export function pickSchedulePollWinner(
  candidates: readonly ScheduleCandidate[],
  voteCounts: readonly number[],
): SchedulePollWinner | null {
  const max = Math.max(0, ...voteCounts);
  if (max === 0) return null;
  const tied = candidates.filter((_, index) => (voteCounts[index] ?? 0) === max);
  return { candidate: tied[0], votes: max, tiedCount: tied.length };
}

/** 투표 마감 답장 문구 */
export function buildSchedulePollResultMessage({
  title,
  winner,
  baseUrl,
}: {
  title: string;
  winner: SchedulePollWinner | null;
  baseUrl: string;
}): string {
  if (!winner) {
    return `🗳️ **${title}** 투표가 끝났지만 참여한 표가 없어 날짜를 정하지 못했습니다.`;
  }
  const tie =
    winner.tiedCount > 1
      ? ` — 동률 ${winner.tiedCount}개 중 가장 이른 날짜`
      : "";
  // 꺾쇠로 감싸 링크 미리보기 임베드가 펼쳐지지 않게 한다.
  const url = `${baseUrl}/calendar?date=${encodeURIComponent(winner.candidate.dateKey)}`;
  return [
    `🗳️ **${title}** 투표가 끝났습니다.`,
    `가장 많은 표: **${formatScheduleCandidate(winner.candidate)}** (${winner.votes}표${tie})`,
    `마스터는 웹 캘린더에서 이 날짜로 세션을 만들 수 있습니다: <${url}>`,
  ].join("\n");
}

export interface SchedulePollJob {
  channelId: string;
  messageId: string;
  title: string;
  candidates: ScheduleCandidate[];
  /** 투표 마감 시각 (epoch ms) */
  expiresAt: number;
}

const pendingTimers = new Set<NodeJS.Timeout>();

function discordErrorCode(error: unknown): number | null {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "number"
    ? error.code
    : null;
}

function schedule(callback: () => void, delayMs: number): void {
  const timer = setTimeout(() => {
    pendingTimers.delete(timer);
    callback();
  }, delayMs);
  timer.unref();
  pendingTimers.add(timer);
}

async function finalizeSchedulePoll(
  client: Client,
  job: SchedulePollJob,
  baseUrl: string,
  attempt: number,
): Promise<void> {
  try {
    const channel = await client.channels.fetch(job.channelId);
    if (!channel?.isTextBased() || !("messages" in channel)) return;
    const message = await channel.messages.fetch(job.messageId);
    const poll = message.poll;
    if (!poll) return;
    if (!poll.resultsFinalized && attempt < FINALIZE_MAX_RETRIES) {
      schedule(() => {
        void finalizeSchedulePoll(client, job, baseUrl, attempt + 1);
      }, FINALIZE_RETRY_MS);
      return;
    }
    const voteCounts = [...poll.answers.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, answer]) => ("voteCount" in answer ? answer.voteCount : 0));
    await message.reply({
      content: buildSchedulePollResultMessage({
        title: job.title,
        winner: pickSchedulePollWinner(job.candidates, voteCounts),
        baseUrl,
      }),
      allowedMentions: { parse: [], repliedUser: false },
    });
  } catch (error) {
    // 투표 메시지를 지웠으면 조용히 끝낸다.
    if (discordErrorCode(error) === UNKNOWN_MESSAGE_CODE) return;
    console.error("[schedule-poll] 투표 결과 답장 실패:", error);
  }
}

/** 투표 마감 뒤 결과 답장을 예약한다 (프로세스 메모리 타이머). */
export function scheduleSchedulePollFinalization(
  client: Client,
  job: SchedulePollJob,
  { baseUrl, now = Date.now }: { baseUrl: string; now?: () => number },
): void {
  const delayMs = Math.max(0, job.expiresAt - now()) + FINALIZE_GRACE_MS;
  schedule(() => {
    void finalizeSchedulePoll(client, job, baseUrl, 0);
  }, delayMs);
}

/** 종료 시 남은 마감 처리 예약을 정리한다. */
export function stopSchedulePollFinalizers(): void {
  for (const timer of pendingTimers) clearTimeout(timer);
  pendingTimers.clear();
}
