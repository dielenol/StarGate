/**
 * trpg_sessions → SerializedSession 어댑터
 *
 * trpg-bot 단독 운영 컬렉션(`trpg_sessions`) 의 raw 문서를 ERP 세션 캘린더가
 * 소비하는 `SerializedSession` view model 로 변환한다. registra-bot 세션과
 * 동일 인터페이스에 합쳐서 표시하기 위한 브리지 계층.
 *
 * 환경변수 게이팅:
 *  - `TRPG_GUILD_ID` 가 비어 있으면 항상 `[]` 반환 → registra-only fallback.
 *  - `TRPG_GUILD_ID` 는 env.ts 같은 공용 모듈이 없으므로 본 모듈 내부에서
 *    `process.env` 를 직접 읽고 캐싱한다.
 *
 * 변환 규칙:
 *  - `date + startTime` (KST) → UTC ISO 의 `targetDateTime` 으로 정규화.
 *    Invalid Date 가 나오면 해당 row 를 skip + console.warn 으로 흔적 남김.
 *  - `closeDateTime` 은 모델상 부재 — 빈 문자열로 처리 (UI 가 dur 계산 시 skip).
 *  - `channelId` / `messageId` / `targetRoleId` 는 trpg 모델에 없으므로 "".
 *    SessionsClient 는 source === "trpg" 일 때 buildDiscordLink 를 호출하지 않는다.
 *  - participantDiscordIds 의 displayName 매핑은 `listActiveTrpgGuildMembers` 1회 호출.
 *    탈퇴자(leftAt != null) 는 본 함수가 호출하는 active-only API 에서 누락되므로
 *    discord id 를 그대로 표시 (fallback).
 */

import "./init";

import {
  trpgGuildMembersCol,
  trpgSessionsCol,
  type SessionStatus,
  type TrpgSession,
  type TrpgSessionStatus,
} from "@stargate/shared-db";

import type { SerializedSession } from "@/hooks/queries/useSessionsQuery";
import { getParticipantCodenameOverride } from "@/lib/session-participant-overrides";

interface TrpgMonthRange {
  start: string;
  end: string;
}

/** `process.env.TRPG_GUILD_ID` 정규화 — 비어 있으면 null. */
export function getTrpgGuildId(): string | null {
  const raw = process.env.TRPG_GUILD_ID?.trim();
  return raw && raw.length > 0 ? raw : null;
}

/** `process.env.TRPG_WEB_BASE_URL` 정규화 — trailing slash 제거. 누락 시 null. */
export function getTrpgWebBaseUrl(): string | null {
  const raw = process.env.TRPG_WEB_BASE_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

function trpgMonthRange(year: number, monthIndex: number): TrpgMonthRange {
  const month = monthIndex + 1;
  const mm = String(month).padStart(2, "0");
  const start = `${year}-${mm}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const end = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  return { start, end };
}

function toKstDateTime(session: Pick<TrpgSession, "date" | "startTime">): Date {
  return new Date(`${session.date}T${session.startTime}:00+09:00`);
}

function mapTrpgStatus(
  status: TrpgSessionStatus,
  targetDateTime: Date,
  now: Date,
): SessionStatus | null {
  switch (status) {
    case "open":
      return targetDateTime.getTime() <= now.getTime() ? "CLOSED" : "OPEN";
    case "cancelled":
      return "CANCELED";
    default: {
      const _exhaustive: never = status;
      void _exhaustive;
      return null;
    }
  }
}

function currentKstParts(now: Date): { date: string; time: string } {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return {
    date: kst.toISOString().slice(0, 10),
    time: kst.toISOString().slice(11, 16),
  };
}

/**
 * trpg_sessions 컬렉션에서 해당 월의 세션을 가져와
 * registra 세션과 동일한 `SerializedSession` 형태로 변환한다.
 *
 * trpg 모델은 완료 상태가 없으므로, 아직 open 이어도 시작 시각이 지난 세션은
 * ERP 표시용으로 `CLOSED` 처리한다. cancelled 원천 상태는 그대로 취소로 표시한다.
 *
 * @param year 연 (예: 2026)
 * @param monthIndex 0-11 — JS Date 의 month index 와 동일
 * @param viewerDiscordId 현재 로그인 유저의 discord id (myRsvp 계산용)
 */
export async function fetchTrpgSessionsAsSerialized(
  year: number,
  monthIndex: number,
  viewerDiscordId?: string | null,
): Promise<SerializedSession[]> {
  const trpgGuildId = getTrpgGuildId();
  if (!trpgGuildId) return [];

  const { start, end } = trpgMonthRange(year, monthIndex);
  const col = await trpgSessionsCol();
  const raws = await col
    .find({
      guildId: trpgGuildId,
      date: { $gte: start, $lt: end },
    })
    .sort({ date: 1, startTime: 1 })
    .toArray();

  if (raws.length === 0) return [];

  // 해당 월 raw 들의 participantDiscordIds 합집합 → displayName 한 번에 매핑.
  // 활성 멤버(leftAt: null) 만 — 탈퇴자는 discord id 그대로 폴백.
  // 전체 멤버 풀을 끌어오지 않고 $in 으로 좁혀서 불필요한 페이로드를 차단한다.
  const participantIds = Array.from(
    new Set(raws.flatMap((r) => r.participantDiscordIds)),
  );

  const nameByDiscordId = new Map<string, string>();
  if (participantIds.length > 0) {
    const col = await trpgGuildMembersCol();
    const members = await col
      .find({
        guildId: trpgGuildId,
        discordUserId: { $in: participantIds },
        leftAt: null,
      })
      .project<{ discordUserId: string; displayName: string }>({
        discordUserId: 1,
        displayName: 1,
        _id: 0,
      })
      .toArray();
    for (const m of members) {
      nameByDiscordId.set(m.discordUserId, m.displayName);
    }
  }

  const serialized: SerializedSession[] = [];
  const now = new Date();
  for (const raw of raws) {
    // KST 기준 `YYYY-MM-DDTHH:mm:00+09:00` 로 결합 → UTC ISO 변환.
    const dt = toKstDateTime(raw);
    if (Number.isNaN(dt.getTime())) {
      console.warn(
        `[trpg-sessions-bridge] invalid date/time skipped: id=${raw._id?.toString() ?? "?"} date=${raw.date} startTime=${raw.startTime}`,
      );
      continue;
    }
    const targetIso = dt.toISOString();

    const mappedStatus = mapTrpgStatus(raw.status, dt, now);
    if (!mappedStatus) {
      console.warn(
        `[trpg-sessions-bridge] unknown status skipped: id=${raw._id?.toString() ?? "?"} status=${String(raw.status)}`,
      );
      continue;
    }

    const participants = raw.participantDiscordIds.map((id) => {
      const displayName = nameByDiscordId.get(id) ?? id;
      return {
        userId: id,
        status: "YES" as const,
        displayName,
        codename: getParticipantCodenameOverride(displayName),
      };
    });

    const isViewerYes =
      typeof viewerDiscordId === "string" &&
      viewerDiscordId.length > 0 &&
      raw.participantDiscordIds.includes(viewerDiscordId);

    serialized.push({
      _id: raw._id?.toString() ?? "",
      guildId: raw.guildId,
      // trpg 모델에는 디스코드 공지 채널/메시지 개념이 없다 — 클라이언트에서
      // source === "trpg" 분기로 buildDiscordLink 자체를 호출하지 않는다.
      channelId: "",
      messageId: "",
      targetRoleId: "",
      title: raw.title,
      targetDateTime: targetIso,
      // close 시점이 모델에 없음 — 빈 문자열. _utils.formatDuration 은 NaN 으로 빈값 반환.
      closeDateTime: "",
      status: mappedStatus,
      createdBy: raw.createdByDiscordId,
      createdAt: raw.createdAt.toISOString(),
      updatedAt: raw.updatedAt.toISOString(),
      participants,
      counts: {
        yes: raw.participantDiscordIds.length,
        no: 0,
      },
      myRsvp: isViewerYes ? "YES" : null,
      source: "trpg",
    });
  }

  return serialized;
}

/** registra 측 ActiveSessionCounts 와 동일 shape — 통합 카운트 합산용. */
export interface TrpgActiveCounts {
  open: number;
  closed: number;
  cancel: number;
  mine: number;
}

/**
 * trpg_sessions 전역 활성 세션 카운트.
 *
 * trpg 모델은 status 가 open / cancelled 2단만이고 완료 상태가 없으므로,
 * open 중 시작 시각이 지난 세션은 ERP 표시용 `closed` 로 합산한다.
 * cancelled 는 `cancel`. `mine` 은 viewerDiscordId 가 participantDiscordIds 에
 * 포함된 open 세션 수이며, 지난 open 세션도 내 참여로 유지한다.
 *
 * TRPG_GUILD_ID 미설정 시 0 카운트 반환.
 */
export async function countTrpgActiveSessions(
  viewerDiscordId?: string | null,
): Promise<TrpgActiveCounts> {
  const trpgGuildId = getTrpgGuildId();
  if (!trpgGuildId) return { open: 0, closed: 0, cancel: 0, mine: 0 };

  const col = await trpgSessionsCol();
  const { date: today, time: nowTime } = currentKstParts(new Date());

  const [open, closed, cancel] = await Promise.all([
    col.countDocuments({
      guildId: trpgGuildId,
      status: "open",
      $or: [
        { date: { $gt: today } },
        { date: today, startTime: { $gt: nowTime } },
      ],
    }),
    col.countDocuments({
      guildId: trpgGuildId,
      status: "open",
      $or: [
        { date: { $lt: today } },
        { date: today, startTime: { $lte: nowTime } },
      ],
    }),
    col.countDocuments({
      guildId: trpgGuildId,
      status: "cancelled",
    }),
  ]);

  let mine = 0;
  if (typeof viewerDiscordId === "string" && viewerDiscordId.length > 0) {
    mine = await col.countDocuments({
      guildId: trpgGuildId,
      status: "open",
      participantDiscordIds: viewerDiscordId,
    });
  }

  return { open, closed, cancel, mine };
}
