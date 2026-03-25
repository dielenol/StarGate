/**
 * DB·길드 월별 세션을 조회해 결과 카드 PNG 버퍼를 만듭니다.
 *
 * `/session result`·마감 공통으로 사용합니다.
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
