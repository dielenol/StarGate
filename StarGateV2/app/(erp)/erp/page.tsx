import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import {
  findCharacterById,
  findMainCharacterByOwner,
  listCharactersByOwner,
} from "@/lib/db/characters";
import { getCharacterBalance } from "@/lib/db/credits";
import { countUnread, listUserNotifications } from "@/lib/db/notifications";
import {
  countParticipationByUserId,
  enrichSessions,
  findUpcomingSessionsByGuild,
} from "@/lib/db/sessions";
import { findUserById } from "@/lib/db/users";
import { listWikiPagesLite } from "@/lib/db/wiki";
import { getPixelCharacterPath } from "@/lib/format/character-asset";
import { formatDate, formatTime } from "@/lib/format/date";

import type { NotificationType } from "@/types/notification";
import type { SessionStatus } from "@/types/session";

import Bar from "@/components/ui/Bar/Bar";
import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import PageHead from "@/components/ui/PageHead/PageHead";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";
import Seal from "@/components/ui/Seal/Seal";
import Spread from "@/components/ui/Spread/Spread";
import Stack from "@/components/ui/Stack/Stack";
import Tag, { rankTone } from "@/components/ui/Tag/Tag";

import styles from "./page.module.css";

/**
 * 모듈 스코프 헬퍼 — react-hooks/purity 규칙이 component 본문 내부의
 * Date.now() 호출을 impure 로 막는다. 모듈 함수로 분리해 우회.
 */
function daysSinceCreated(createdAt: Date | string): number {
  const d = typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  const diff = Date.now() - d.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

/**
 * 디스코드 메시지 딥링크. SessionsClient 의 동명 헬퍼와 정책 동일 — "use client"
 * 모듈에서 import 하면 server 컴포넌트 빌드에 client reference 가 박히므로 inline 유지.
 */
function buildDiscordLink(opts: {
  guildId: string;
  channelId: string;
  messageId?: string;
}): string {
  const { guildId, channelId, messageId } = opts;
  if (messageId && messageId.trim().length > 0) {
    return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
  }
  return `https://discord.com/channels/${guildId}/${channelId}`;
}

/**
 * MY CHARACTER 아바타 — pixel-character (도트 풀샷) 우선, 폴백 chain:
 *   1. /assets/peoples/<Slug>-pixel-character.png (codename → slug 매핑)
 *   2. previewImage (pixel-profile 도트)
 *   3. Seal initial 글자
 */
function CharAvatar({
  codename,
  previewImage,
  initial,
}: {
  codename: string;
  previewImage: string;
  initial: string;
}) {
  const pixelChar = getPixelCharacterPath(codename);
  const src = pixelChar || previewImage || null;
  if (src) {
    return (
      <div className={styles.charMini__avatar}>
        <Image
          src={src}
          alt=""
          fill
          sizes="96px"
          className={styles.charMini__avatarImg}
        />
      </div>
    );
  }
  return (
    <div className={styles.charMini__avatar}>
      <Seal size="sm">{initial}</Seal>
    </div>
  );
}

/** MY CHARACTER VITALS 한 줄 — 라벨 + 값/max + Bar */
function CharVital({
  label,
  value,
  max,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  tone: "gold" | "info" | "danger";
}) {
  return (
    <div className={styles.charMini__vital}>
      <div className={styles.charMini__vitalHead}>
        <span className={styles.charMini__vitalLabel}>{label}</span>
        <span className={styles.charMini__vitalValue}>
          <b>{value}</b>
          <span className={styles.charMini__vitalMax}>/{max}</span>
        </span>
      </div>
      <Bar value={value} tone={tone} />
    </div>
  );
}

const NOTIFICATION_TAG: Record<
  NotificationType,
  { label: string; tone: "gold" | "info" | "success" | "default" }
> = {
  SESSION_REMIND: { label: "세션", tone: "gold" },
  ROLE_CHANGE: { label: "역할", tone: "info" },
  CREDIT_RECEIVED: { label: "크레딧", tone: "success" },
  REPORT_PUBLISHED: { label: "리포트", tone: "gold" },
  SYSTEM: { label: "시스템", tone: "default" },
};

const SESSION_STATUS_TAG: Record<
  SessionStatus,
  { label: string; tone: "gold" | "info" | "success" | "danger" | "default" }
> = {
  OPEN: { label: "모집중", tone: "gold" },
  CLOSING: { label: "마감 임박", tone: "info" },
  CLOSED: { label: "확정", tone: "success" },
  CANCELING: { label: "취소 예정", tone: "danger" },
  CANCELED: { label: "취소", tone: "danger" },
};

export default async function ERPDashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const userId = session.user.id;
  const viewerDiscordId = session.user.discordId ?? null;
  const guildId = process.env.GUILD_ID ?? "";

  // 다가올 세션은 enrich 후 필터링용으로 더 넉넉히 fetch (기본 limit 20).
  // countParticipationByUserId 는 모든 유저 카운트를 한 번에 반환 — viewer 항목만 lookup.
  // balance: character 단위 ledger 전환됨 — 메인 캐릭 미등록 user 는 0 표시.
  // mainCharacter 은 정합성 위반 시 throw → null 폴백 + 별도 시그널 노출.
  const mainCharacterPromise = findMainCharacterByOwner(userId).then(
    (v) => ({ ok: true as const, value: v }),
    (err: unknown) => ({
      ok: false as const,
      message:
        err instanceof Error ? err.message : "메인 캐릭터 조회 실패 (정합성 위반)",
    }),
  );

  const [
    user,
    myCharRefs,
    mainCharacterResult,
    notifications,
    unreadCount,
    upcomingRaw,
    participationCounts,
    wikiPages,
  ] = await Promise.all([
    findUserById(userId).catch(() => null),
    listCharactersByOwner(userId).catch(() => []),
    mainCharacterPromise,
    listUserNotifications(userId, 3).catch(() => []),
    countUnread(userId).catch(() => 0),
    guildId
      ? findUpcomingSessionsByGuild(guildId, 20).catch(() => [])
      : Promise.resolve([]),
    viewerDiscordId
      ? countParticipationByUserId().catch(() => ({}) as Record<string, number>)
      : Promise.resolve({} as Record<string, number>),
    listWikiPagesLite().catch(() => []),
  ]);

  const mainCharacter = mainCharacterResult.ok ? mainCharacterResult.value : null;
  const mainIntegrityError = mainCharacterResult.ok ? null : mainCharacterResult.message;

  // 누적 STATS — profile 폐지로 dashboard 에 흡수.
  const mySessionCount = viewerDiscordId
    ? (participationCounts[viewerDiscordId] ?? 0)
    : null;
  const joinedDays = user ? daysSinceCreated(user.createdAt) : 0;
  const myWikiCount = wikiPages.filter((w) => w.createdBy === userId).length;

  // 다음 단계의 직렬 await 들을 병렬화:
  //   1) balance — mainCharacter 결정 후 character 단위 ledger 조회.
  //   2) enrichSessions — viewerDiscordId 부착 (mainCharacter 의존 없음).
  //   3) firstCharRef → findCharacterById — MY CHARACTER 카드용 상세.
  // mainCharacter 와 firstCharRef 가 동일 id 면 findCharacterById 중복 호출 제거.
  const firstCharRef = myCharRefs[0];
  const firstCharIdStr = firstCharRef?._id ? String(firstCharRef._id) : null;
  const mainCharIdStr = mainCharacter ? String(mainCharacter._id) : null;
  const isSameAsMain = !!firstCharIdStr && firstCharIdStr === mainCharIdStr;

  const [balance, enrichedUpcoming, firstCharFetched] = await Promise.all([
    mainCharacter
      ? getCharacterBalance(mainCharIdStr!).catch(() => 0)
      : Promise.resolve(0),
    upcomingRaw.length
      ? enrichSessions(upcomingRaw, viewerDiscordId).catch(() => [])
      : Promise.resolve(
          [] as Awaited<ReturnType<typeof enrichSessions>>,
        ),
    firstCharIdStr && !isSameAsMain
      ? findCharacterById(firstCharIdStr).catch(() => null)
      : Promise.resolve(null),
  ]);

  // 동일 id 면 mainCharacter 재사용 → 중복 DB 호출 제거.
  const myChar = isSameAsMain ? mainCharacter : firstCharFetched;

  // MISSION QUEUE — 내 RSVP=YES + CANCELED 제외, 가장 임박 3건.
  const myRsvpUpcoming = enrichedUpcoming
    .filter(
      ({ raw, myRsvp }) => myRsvp === "YES" && raw.status !== "CANCELED",
    )
    .slice(0, 3);

  // TASKS — 내 응답이 없는 OPEN/CLOSING 세션 (응답 필요), 임박 5건.
  const pendingResponse = enrichedUpcoming
    .filter(
      ({ raw, myRsvp }) =>
        myRsvp === null &&
        (raw.status === "OPEN" || raw.status === "CLOSING"),
    )
    .slice(0, 5);

  const recentWikis = [...wikiPages]
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
    .slice(0, 3);

  const lastSync = formatTime(new Date());

  return (
    <>
      <PageHead
        breadcrumb={[{ label: "ERP" }, { label: "HOME" }]}
        title="대시보드"
        right={
          <>
            <Tag>LAST SYNC · {lastSync} KST</Tag>
          </>
        }
      />

      <div className={styles.row3}>
        {/* MY CHARACTER — pixel-character avatar + tier/level + HP/SAN mini bar */}
        <Box>
          <PanelTitle
            right={
              myChar ? (
                <span className={styles.mono}>{myChar.codename}</span>
              ) : null
            }
          >
            MY CHARACTER
          </PanelTitle>
          {myChar ? (
            <>
              <div className={styles.charMini}>
                <CharAvatar
                  codename={myChar.codename}
                  previewImage={myChar.previewImage}
                  initial={(myChar.lore.name || myChar.codename)
                    .charAt(0)
                    .toUpperCase()}
                />
                <div className={styles.charMini__body}>
                  <Eyebrow tone="gold">{myChar.codename}</Eyebrow>
                  <div className={styles.charMini__name}>
                    {myChar.lore.name || myChar.codename}
                  </div>
                  <div className={styles.charMini__tags}>
                    <Tag tone="gold">{myChar.type}</Tag>
                    {myChar.agentLevel ? (
                      <Tag tone={rankTone(myChar.agentLevel) ?? "default"}>
                        권한 {myChar.agentLevel}
                      </Tag>
                    ) : null}
                  </div>
                </div>
              </div>
              {myChar.type === "AGENT" && myChar.play ? (
                <div className={styles.charMini__vitals}>
                  <CharVital
                    label="HP"
                    value={myChar.play.hp}
                    max={300}
                    tone="gold"
                  />
                  <CharVital
                    label="SAN"
                    value={myChar.play.san}
                    max={100}
                    tone={myChar.play.san < 30 ? "danger" : "info"}
                  />
                </div>
              ) : null}
              <div className={styles.charMini__ctaRow}>
                <Button
                  as="a"
                  href={`/erp/characters/${String(myChar._id)}`}
                  size="sm"
                  className={styles.charMini__ctaBtn}
                >
                  시트 →
                </Button>
              </div>
            </>
          ) : (
            <div className={styles.empty}>
              등록된 캐릭터가 없습니다.
              <Button as="a" href="/erp/characters" size="sm">
                캐릭터 목록 →
              </Button>
            </div>
          )}
        </Box>

        {/* RESOURCES — 지금 운용 가능한 자원 */}
        <Box>
          <PanelTitle right={<span className={styles.mono}>NOW</span>}>
            RESOURCES
          </PanelTitle>
          <div className={styles.metricsGrid}>
            <Link href="/erp/credits" className={styles.metric}>
              <span className={styles.metric__label}>잔액</span>
              <span className={`${styles.metric__value} ${styles.metric__valueGold}`}>
                ¤ {balance.toLocaleString()}
              </span>
            </Link>
          </div>
          {mainIntegrityError ? (
            <div className={styles.empty}>
              <strong>⚠ 정합성 위반</strong>: {mainIntegrityError}
              <br />
              운영자에게 문의하세요.
            </div>
          ) : null}
        </Box>

        {/* OPERATIVE STATS — 누적 활동 시그널 */}
        <Box>
          <PanelTitle right={<span className={styles.mono}>LIFETIME</span>}>
            OPERATIVE STATS
          </PanelTitle>
          <div className={styles.metricsGrid}>
            <Link href="/erp/characters" className={styles.metric}>
              <span className={styles.metric__label}>보유 캐릭터</span>
              <span className={styles.metric__value}>{myCharRefs.length}</span>
            </Link>
            <Link href="/erp/sessions" className={styles.metric}>
              <span className={styles.metric__label}>누적 작전</span>
              <span className={styles.metric__value}>
                {mySessionCount !== null ? mySessionCount : "—"}
              </span>
            </Link>
            <div className={styles.metric}>
              <span className={styles.metric__label}>가입 후</span>
              <span className={styles.metric__value}>{joinedDays}D</span>
            </div>
            <Link href="/erp/wiki" className={styles.metric}>
              <span className={styles.metric__label}>작성한 위키</span>
              <span className={styles.metric__value}>{myWikiCount}</span>
            </Link>
          </div>
        </Box>

        {/* RECENT NOTIFICATIONS */}
        <Box>
          <PanelTitle
            right={
              <Link href="/erp/notifications" className={styles.panelLink}>
                전체 →
              </Link>
            }
          >
            <span>NOTIFICATIONS</span>
            {unreadCount > 0 ? (
              <span className={styles.unreadDot} aria-label={`안 읽은 알림 ${unreadCount}건`}>
                ● {unreadCount}
              </span>
            ) : null}
          </PanelTitle>
          {notifications.length === 0 ? (
            <div className={styles.empty}>새 알림 없음</div>
          ) : (
            <Stack gap={10} className={styles.notifList}>
              {notifications.map((n) => {
                const meta = NOTIFICATION_TAG[n.type];
                return (
                  <Spread key={String(n._id)} gap={10}>
                    <span className={styles.notifLine}>
                      <Tag tone={meta.tone}>{meta.label}</Tag>
                      <span className={styles.notifText}>{n.title}</span>
                    </span>
                    <span className={styles.mono}>{formatTime(n.createdAt)}</span>
                  </Spread>
                );
              })}
            </Stack>
          )}
        </Box>
      </div>

      <div className={styles.rowWideNarrow}>
        {/* MISSION QUEUE — 내 RSVP=YES 다가올 작전 */}
        <Box>
          <PanelTitle
            right={
              <Link href="/erp/sessions" className={styles.panelLink}>
                달력 →
              </Link>
            }
          >
            MISSION QUEUE · 내 작전
          </PanelTitle>
          {!viewerDiscordId ? (
            <div className={styles.empty}>
              Discord 연동 후 내 작전이 표시됩니다.
              <Button as="a" href="/erp/account" size="sm">
                계정 설정 →
              </Button>
            </div>
          ) : myRsvpUpcoming.length === 0 ? (
            <div className={styles.empty}>예정된 작전 없음</div>
          ) : (
            <Stack gap={10}>
              {myRsvpUpcoming.map(({ raw: s }) => {
                const meta = SESSION_STATUS_TAG[s.status] ?? {
                  label: s.status,
                  tone: "default" as const,
                };
                const link = buildDiscordLink(s);
                return (
                  <div key={String(s._id)} className={styles.sessionCard}>
                    <div className={styles.sessionCard__code}>
                      <div className={styles.sessionCard__codeMain}>
                        {formatDate(s.targetDateTime, "compact")}
                      </div>
                      <div className={styles.sessionCard__codeSub}>
                        {formatTime(s.targetDateTime)}
                      </div>
                    </div>
                    <div className={styles.sessionCard__body}>
                      <div className={styles.sessionCard__title}>{s.title}</div>
                    </div>
                    <div className={styles.sessionCard__meta}>
                      <Tag tone={meta.tone}>{meta.label}</Tag>
                      <Button
                        as="a"
                        href={link}
                        size="sm"
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${s.title} · 디스코드에서 열기`}
                      >
                        ↗
                      </Button>
                    </div>
                  </div>
                );
              })}
            </Stack>
          )}
        </Box>

        {/* TASKS · 응답 필요 — 내 응답 없는 OPEN/CLOSING */}
        <Box>
          <PanelTitle
            right={
              pendingResponse.length > 0 ? (
                <span className={styles.taskCount}>{pendingResponse.length}</span>
              ) : (
                <span className={styles.mono}>—</span>
              )
            }
          >
            TASKS · 응답 필요
          </PanelTitle>
          {!viewerDiscordId ? (
            <div className={styles.empty}>Discord 연동 필요</div>
          ) : pendingResponse.length === 0 ? (
            <div className={styles.empty}>응답 필요 작전 없음</div>
          ) : (
            <Stack gap={8} className={styles.taskList}>
              {pendingResponse.map(({ raw: s }) => {
                const link = buildDiscordLink(s);
                const tone = s.status === "CLOSING" ? "danger" : "gold";
                return (
                  <div key={String(s._id)} className={styles.taskRow}>
                    <Tag tone={tone}>
                      {s.status === "CLOSING" ? "마감 임박" : "모집중"}
                    </Tag>
                    <Link
                      href={`/erp/sessions`}
                      className={styles.taskTitle}
                      title={s.title}
                    >
                      {s.title}
                    </Link>
                    <Button
                      as="a"
                      href={link}
                      size="sm"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      응답 ↗
                    </Button>
                  </div>
                );
              })}
            </Stack>
          )}
        </Box>
      </div>

      {/* RECENT WIKI CHANGES */}
      <Box>
        <PanelTitle
          right={
            <Link href="/erp/wiki" className={styles.panelLink}>
              전체 →
            </Link>
          }
        >
          RECENT WIKI CHANGES
        </PanelTitle>
        {recentWikis.length === 0 ? (
          <div className={styles.empty}>최근 변경 내역 없음</div>
        ) : (
          <Stack gap={8}>
            {recentWikis.map((w) => (
              <Spread key={String(w._id)} gap={10}>
                <Link
                  href={`/erp/wiki/${String(w._id)}`}
                  className={styles.wikiLink}
                >
                  {w.title}
                </Link>
                <span className={styles.mono}>{formatDate(w.updatedAt, "compact")}</span>
              </Spread>
            ))}
          </Stack>
        )}
      </Box>
    </>
  );
}
