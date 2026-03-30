/**
 * DB·길드 월별 세션을 조회해 결과 카드 PNG 버퍼를 만듭니다.
 *
 * `/일정 집계`(이미지포함)·마감 공통으로 사용합니다.
 *
 * @module utils/build-session-result-card
 */

import type { Collection, GuildMember } from "discord.js";
import { isResultCardImageEnabled } from "../config.js";
import { findSessionsByGuildInMonth } from "../db/sessions.js";
import { formatSessionDateTime } from "./embed.js";
import { displayLineForUser } from "./member-display-line.js";
import {
  renderSessionResultCardPng,
  renderGuildMonthCalendarPng,
  type CalendarSessionMark,
} from "./result-card-image.js";
import type { Session, SessionResponse } from "../types/session.js";

export type BuildSessionResultCardOptions = {
  session: Session;
  guildId: string;
  members: Collection<string, GuildMember>;
  responses: SessionResponse[];
  yesIds: string[];
  noIds: string[];
  noResponseIds: string[];
  cardMode: "open" | "closed";
};

/**
 * 동일 길드·조회 중 세션 `targetDateTime`이 속한 달의 OPEN/CLOSED 세션을 캘린더에 표시하고,
 * 조회 중 세션의 집계 명단을 포함한 PNG를 반환합니다.
 */
export async function buildSessionResultCardBuffer(
  opts: BuildSessionResultCardOptions
): Promise<Buffer | null> {
  if (!isResultCardImageEnabled()) return null;
  if (opts.session._id === undefined || opts.session._id === null) return null;

  const primaryId = String(opts.session._id);
  const at = opts.session.targetDateTime;
  const y = at.getFullYear();
  const mo = at.getMonth();

  const peers = await findSessionsByGuildInMonth(opts.guildId, y, mo);
  const byId = new Map<string, CalendarSessionMark>();

  for (const s of peers) {
    if (!s._id) continue;
    if (s.status !== "OPEN" && s.status !== "CLOSED") continue;
    const id = String(s._id);
    byId.set(id, {
      at: s.targetDateTime,
      title: s.title,
      status: s.status,
      isPrimary: id === primaryId,
    });
  }

  if (!byId.has(primaryId)) {
    const st = opts.session.status;
    if (st === "OPEN" || st === "CLOSED") {
      byId.set(primaryId, {
        at: opts.session.targetDateTime,
        title: opts.session.title,
        status: st,
        isPrimary: true,
      });
    }
  } else {
    const cur = byId.get(primaryId)!;
    byId.set(primaryId, { ...cur, isPrimary: true });
  }

  const calendarMarks = [...byId.values()];

  const attendingLines = opts.yesIds.map((id) =>
    displayLineForUser(id, opts.responses, opts.members, 52)
  );
  const absentLines = opts.noIds.map((id) =>
    displayLineForUser(id, opts.responses, opts.members, 52)
  );
  const noResponseLines = opts.noResponseIds.map((id) =>
    displayLineForUser(id, opts.responses, opts.members, 52)
  );

  return renderSessionResultCardPng({
    title: opts.session.title,
    sessionWhen: formatSessionDateTime(opts.session.targetDateTime),
    sessionAt: opts.session.targetDateTime,
    calendarMarks,
    cardMode: opts.cardMode,
    attending: attendingLines,
    absent: absentLines,
    noResponse: noResponseLines,
  });
}

/**
 * 길드·연·월의 OPEN/CLOSED 세션만 모아 캘린더 격자 PNG만 생성합니다.
 */
export async function buildGuildMonthCalendarOnlyBuffer(
  guildId: string,
  year: number,
  monthIndex: number
): Promise<Buffer | null> {
  if (!isResultCardImageEnabled()) return null;

  const peers = await findSessionsByGuildInMonth(guildId, year, monthIndex);
  const marks: CalendarSessionMark[] = [];
  for (const s of peers) {
    if (!s._id) continue;
    if (s.status !== "OPEN" && s.status !== "CLOSED") continue;
    marks.push({
      at: s.targetDateTime,
      title: s.title,
      status: s.status,
      isPrimary: false,
    });
  }

  const anchorAt = new Date(year, monthIndex, 1);
  return renderGuildMonthCalendarPng({ anchorAt, calendarMarks: marks });
}

/**
 * 해당 연·월에 캘린더에 찍을 본인 응답 세션이 하나라도 있는지 (PNG 생성 여부 판단용).
 */
export function hasParticipationCalendarMarksInMonth(
  items: Array<{ session: Session }>,
  year: number,
  monthIndex: number
): boolean {
  for (const { session: s } of items) {
    if (!s._id) continue;
    const t = s.targetDateTime;
    if (t.getFullYear() !== year || t.getMonth() !== monthIndex) continue;
    if (s.status !== "OPEN" && s.status !== "CLOSED" && s.status !== "CANCELED")
      continue;
    return true;
  }
  return false;
}

/**
 * `/일정 참여확인` 에페메랄용 월간 캘린더 PNG (`/일정 달력`과 동일 격자).
 * `year`·`monthIndex`는 봇 로컬 **이번 달** 기준으로 전달하는 것을 권장합니다.
 * 이번 달에 표시할 일정이 없으면 `null`(Puppeteer 호출 없음).
 */
export async function buildParticipationMonthCalendarBuffer(
  items: Array<{ session: Session }>,
  year: number,
  monthIndex: number
): Promise<Buffer | null> {
  if (!isResultCardImageEnabled()) return null;

  const marks: CalendarSessionMark[] = [];
  for (const { session: s } of items) {
    if (!s._id) continue;
    const t = s.targetDateTime;
    if (t.getFullYear() !== year || t.getMonth() !== monthIndex) continue;
    if (s.status !== "OPEN" && s.status !== "CLOSED" && s.status !== "CANCELED")
      continue;
    marks.push({
      at: t,
      title: s.title,
      status: s.status,
      isPrimary: false,
    });
  }

  if (marks.length === 0) return null;

  const anchorAt = new Date(year, monthIndex, 1);
  return renderGuildMonthCalendarPng({
    anchorAt,
    calendarMarks: marks,
    calendarVariant: "participation",
  });
}
