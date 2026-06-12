import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import {
  findCharacterById,
  findMainCharacterByOwnerCached as findMainCharacterByOwner,
  listCharactersByOwner,
} from "@/lib/db/characters";
import { getCharacterBalance } from "@/lib/db/credits";
import { countUnread, listUserNotifications } from "@/lib/db/notifications";
import {
  countParticipationForUser,
  enrichSessions,
  findUpcomingSessionsByGuild,
} from "@/lib/db/sessions";
import { findUserById } from "@/lib/db/users";
import { listWikiPagesLite } from "@/lib/db/wiki";
import { preferOptimizedPublicImagePath } from "@/lib/asset-path";
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
  const src = pixelChar || preferOptimizedPublicImagePath(previewImage) || null;
  if (src) {
    return (
      <div className={styles.charMini__avatar}>
        <Image
          src={src}
          alt=""
          fill
          sizes="112px"
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
  CONSUMABLE_USED: { label: "소모품", tone: "info" },
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

type ActionTone = "gold" | "info" | "success" | "danger" | "default";

interface ActionItem {
  label: string;
  title: string;
  detail: string;
  href: string;
  cta: string;
  tone: ActionTone;
}

function daysUntil(targetAt: Date | string): number {
  const target = typeof targetAt === "string" ? new Date(targetAt) : targetAt;
  const targetMidnight = new Date(
    target.getFullYear(),
    target.getMonth(),
    target.getDate(),
  ).getTime();
  const now = new Date();
  const todayMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  return Math.round((targetMidnight - todayMidnight) / (1000 * 60 * 60 * 24));
}

function ddayLabel(targetAt: Date | string): string {
  const diff = daysUntil(targetAt);
  if (diff === 0) return "TODAY";
  if (diff > 0) return `D-${diff}`;
  return `D+${Math.abs(diff)}`;
}

function dateTimeLabel(targetAt: Date | string): string {
  return `${formatDate(targetAt, "compact")} · ${formatTime(targetAt)}`;
}

export default async function ERPDashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const userId = session.user.id;
  const viewerDiscordId = session.user.discordId ?? null;
  const guildId = process.env.GUILD_ID ?? "";

  // 다가올 세션은 enrich 후 필터링용으로 더 넉넉히 fetch (기본 limit 20).
  // 누적 참여 수는 현재 사용자만 집계해 전역 session_responses 스캔을 피한다.
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
    mySessionCount,
    wikiPages,
  ] = await Promise.all([
    findUserById(userId).catch(() => null),
    listCharactersByOwner(userId).catch(() => []),
    mainCharacterPromise,
    listUserNotifications(userId, 20).catch(() => []),
    countUnread(userId).catch(() => 0),
    guildId
      ? findUpcomingSessionsByGuild(guildId, 20).catch(() => [])
      : Promise.resolve([]),
    viewerDiscordId
      ? countParticipationForUser(viewerDiscordId).catch(() => 0)
      : Promise.resolve(null),
    listWikiPagesLite().catch(() => []),
  ]);

  const mainCharacter = mainCharacterResult.ok ? mainCharacterResult.value : null;
  const mainIntegrityError = mainCharacterResult.ok ? null : mainCharacterResult.message;

  // 누적 STATS — profile 폐지로 dashboard 에 흡수.
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

  const todayMissionCount = enrichedUpcoming.filter(
    ({ raw }) => raw.status !== "CANCELED" && daysUntil(raw.targetDateTime) === 0,
  ).length;
  const openMissionCount = enrichedUpcoming.filter(
    ({ raw }) => raw.status === "OPEN" || raw.status === "CLOSING",
  ).length;
  const notificationPreview = notifications.slice(0, 5);
  const nextMission = myRsvpUpcoming[0]?.raw ?? null;
  const nextMissionMeta = nextMission
    ? (SESSION_STATUS_TAG[nextMission.status] ?? {
        label: nextMission.status,
        tone: "default" as const,
      })
    : null;
  const actionItems: ActionItem[] = [
    mainIntegrityError
      ? {
          label: "캐릭터",
          title: "메인 캐릭터 정합성 확인 필요",
          detail: mainIntegrityError,
          href: "/erp/characters",
          cta: "캐릭터 확인",
          tone: "danger",
        }
      : null,
    !viewerDiscordId
      ? {
          label: "계정",
          title: "Discord 연동 필요",
          detail: "세션 RSVP와 내 작전 표시가 Discord 계정 기준으로 동작합니다.",
          href: "/erp/account",
          cta: "계정 설정",
          tone: "danger",
        }
      : null,
    pendingResponse.length > 0
      ? {
          label: "응답",
          title: `${pendingResponse.length}건의 세션 응답 대기`,
          detail: "모집중 또는 마감 임박 세션에 아직 RSVP가 없습니다.",
          href: "/erp/sessions",
          cta: "세션 확인",
          tone: "gold",
        }
      : null,
    unreadCount > 0
      ? {
          label: "알림",
          title: `${unreadCount}건의 미확인 알림`,
          detail: "최근 시스템/보상/리포트 알림을 확인하세요.",
          href: "/erp/notifications",
          cta: "알림 확인",
          tone: "info",
        }
      : null,
    nextMission
      ? {
          label: "작전",
          title: `${ddayLabel(nextMission.targetDateTime)} · ${nextMission.title}`,
          detail: `${dateTimeLabel(nextMission.targetDateTime)} KST 예정`,
          href: "/erp/sessions",
          cta: "작전 보기",
          tone: nextMissionMeta?.tone ?? "default",
        }
      : null,
  ].filter((item): item is ActionItem => item !== null);

  return (
    <>
      <PageHead
        breadcrumb={[{ label: "ERP" }, { label: "HOME" }]}
        title="대시보드"
      />

      {/* HUD 스트립 — 요원 식별/다음 작전/잔액/응답 대기 한눈 요약 (페이지 내 데이터 재표시) */}
      <section className={styles.hudStrip} aria-label="요원 상태 요약">
        <div className={styles.hudCell}>
          <span className={styles.hudCell__label}>IDENT</span>
          <span className={styles.hudCell__value}>
            {mainCharacter ? (
              <>
                <span className={styles.hudCell__primary}>
                  {mainCharacter.codename}
                </span>
                {mainCharacter.agentLevel ? (
                  <Tag tone={rankTone(mainCharacter.agentLevel) ?? "default"}>
                    {mainCharacter.agentLevel}
                  </Tag>
                ) : null}
              </>
            ) : (
              <span className={styles.hudCell__muted}>UNREGISTERED</span>
            )}
          </span>
        </div>
        <div className={styles.hudCell}>
          <span className={styles.hudCell__label}>NEXT OP</span>
          <span className={styles.hudCell__value}>
            {nextMission ? (
              <>
                <span className={styles.hudCell__primary}>
                  {ddayLabel(nextMission.targetDateTime)}
                </span>
                <span className={styles.hudCell__sub}>
                  {formatTime(nextMission.targetDateTime)}
                </span>
              </>
            ) : (
              <span className={styles.hudCell__muted}>STANDBY</span>
            )}
          </span>
        </div>
        <div className={styles.hudCell}>
          <span className={styles.hudCell__label}>BALANCE</span>
          <span className={styles.hudCell__value}>
            <span
              className={`${styles.hudCell__primary} ${styles["hudCell__primary--gold"]}`}
            >
              ¤ {balance.toLocaleString()}
            </span>
          </span>
        </div>
        <div className={styles.hudCell}>
          <span className={styles.hudCell__label}>PENDING</span>
          <span className={styles.hudCell__value}>
            <span className={styles.hudCell__primary}>
              {pendingResponse.length}
            </span>
            <span className={styles.hudCell__sub}>응답 대기</span>
          </span>
        </div>
      </section>

      <div className={styles.commandGrid}>
        <Box variant="gold" className={styles.actionCenter}>
          <PanelTitle
            right={
              <span
                className={[
                  styles.statusChip,
                  actionItems.length === 0 ? styles["statusChip--idle"] : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {actionItems.length} ACTIVE
              </span>
            }
          >
            ACTION CENTER
          </PanelTitle>
          {actionItems.length === 0 ? (
            <div className={styles.actionEmpty}>
              <Tag tone="success">CLEAR</Tag>
              <span>지금 처리해야 할 항목이 없습니다.</span>
            </div>
          ) : (
            <div className={styles.actionList}>
              {actionItems.slice(0, 4).map((item, index) => (
                <Link
                  key={`${item.label}-${item.title}`}
                  href={item.href}
                  className={[
                    styles.actionItem,
                    styles[`actionItem--${item.tone}`] ?? "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <span className={styles.actionItem__index}>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <Tag tone={item.tone}>{item.label}</Tag>
                  <span className={styles.actionItem__body}>
                    <span className={styles.actionItem__title}>{item.title}</span>
                    <span className={styles.actionItem__detail}>{item.detail}</span>
                  </span>
                  <span className={styles.actionItem__cta}>{item.cta}</span>
                </Link>
              ))}
            </div>
          )}
        </Box>

        <Box className={styles.briefPanel}>
          <PanelTitle right={<span className={styles.mono}>NEXT</span>}>
            MISSION BRIEF
          </PanelTitle>
          {nextMission && nextMissionMeta ? (
            <div className={styles.brief}>
              <div className={styles.brief__stamp}>
                <span>{ddayLabel(nextMission.targetDateTime)}</span>
                <small>{formatTime(nextMission.targetDateTime)}</small>
              </div>
              <div className={styles.brief__body}>
                <div className={styles.brief__title}>{nextMission.title}</div>
                <div className={styles.brief__meta}>
                  <Tag tone={nextMissionMeta.tone}>{nextMissionMeta.label}</Tag>
                  <span>{formatDate(nextMission.targetDateTime, "long")}</span>
                </div>
              </div>
              <Button as="a" href="/erp/sessions" size="sm">
                달력 →
              </Button>
            </div>
          ) : (
            <div className={styles.actionEmpty}>
              <Tag>STANDBY</Tag>
              <span>참여 예정 작전이 없습니다.</span>
            </div>
          )}
        </Box>
      </div>

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
            <Link
              href="/erp/credits"
              className={`${styles.metric} ${styles["metric--wide"]}`}
            >
              <span className={styles.metric__label}>잔액</span>
              <span className={`${styles.metric__value} ${styles.metric__valueGold}`}>
                ¤ {balance.toLocaleString()}
              </span>
            </Link>
            <Link href="/erp/sessions" className={styles.metric}>
              <span className={styles.metric__label}>응답 대기</span>
              <span className={styles.metric__value}>{pendingResponse.length}</span>
            </Link>
            <Link href="/erp/sessions" className={styles.metric}>
              <span className={styles.metric__label}>진행 세션</span>
              <span className={styles.metric__value}>{openMissionCount}</span>
            </Link>
            <Link href="/erp/notifications" className={styles.metric}>
              <span className={styles.metric__label}>미확인</span>
              <span className={styles.metric__value}>{unreadCount}</span>
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
            <Link href="/erp/sessions" className={styles.metric}>
              <span className={styles.metric__label}>오늘 작전</span>
              <span className={styles.metric__value}>{todayMissionCount}</span>
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
          {notificationPreview.length === 0 ? (
            <div className={styles.empty}>새 알림 없음</div>
          ) : (
            <Stack gap={0} className={styles.notifList}>
              {notificationPreview.map((n) => {
                const meta = NOTIFICATION_TAG[n.type];
                return (
                  <Spread
                    key={String(n._id)}
                    gap={10}
                    className={[
                      styles.notifRow,
                      n.isRead ? styles["notifRow--read"] : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <Link
                      href={n.link ?? "/erp/notifications"}
                      className={styles.notifLine}
                    >
                      <Tag tone={meta.tone}>{meta.label}</Tag>
                      <span className={styles.notifText}>{n.title}</span>
                    </Link>
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
                  <div
                    key={String(s._id)}
                    className={[
                      styles.taskRow,
                      s.status === "CLOSING" ? styles["taskRow--urgent"] : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
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
          <Stack gap={0}>
            {recentWikis.map((w) => (
              <Spread key={String(w._id)} gap={10} className={styles.wikiRow}>
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
