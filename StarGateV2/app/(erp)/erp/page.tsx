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
import Button from "@/components/ui/Button/Button";
import PageHead from "@/components/ui/PageHead/PageHead";
import Seal from "@/components/ui/Seal/Seal";
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
  variant = "mini",
}: {
  codename: string;
  previewImage: string;
  initial: string;
  variant?: "mini" | "hero";
}) {
  const pixelChar = getPixelCharacterPath(codename);
  const src = pixelChar || preferOptimizedPublicImagePath(previewImage) || null;
  const avatarClassName = [
    styles.charMini__avatar,
    variant === "hero" ? styles["charMini__avatar--hero"] : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (src) {
    return (
      <div className={avatarClassName}>
        <Image
          src={src}
          alt=""
          fill
          sizes={variant === "hero" ? "176px" : "112px"}
          className={styles.charMini__avatarImg}
        />
      </div>
    );
  }
  return (
    <div className={avatarClassName}>
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
  const displayCharacter = myChar ?? mainCharacter;

  return (
    <>
      <PageHead
        breadcrumb={[{ label: "ERP" }, { label: "HOME" }]}
        title="대시보드"
      />

      <div data-pixel-font="ui">
      <section className={styles.commandCenter} aria-label="운영 홈">
        <article className={`${styles.commandSurface} ${styles.agentStage}`}>
          <div className={styles.agentStage__portrait} aria-hidden="true">
            {displayCharacter ? (
              <CharAvatar
                codename={displayCharacter.codename}
                previewImage={displayCharacter.previewImage}
                initial={(displayCharacter.lore.name || displayCharacter.codename)
                  .charAt(0)
                  .toUpperCase()}
                variant="hero"
              />
            ) : (
              <div
                className={[
                  styles.charMini__avatar,
                  styles["charMini__avatar--hero"],
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <Seal size="sm">ERP</Seal>
              </div>
            )}
          </div>

          <div className={styles.agentStage__content}>
            <span className={styles.sectionLabel}>요원 프로필</span>
            <h2 className={styles.agentStage__name}>
              {displayCharacter
                ? displayCharacter.lore.name || displayCharacter.codename
                : "운용 대기"}
            </h2>
            <div className={styles.agentStage__meta}>
              {displayCharacter ? (
                <>
                  <span>{displayCharacter.codename}</span>
                  <Tag tone="gold">{displayCharacter.type}</Tag>
                  {displayCharacter.agentLevel ? (
                    <Tag tone={rankTone(displayCharacter.agentLevel) ?? "default"}>
                      권한 {displayCharacter.agentLevel}
                    </Tag>
                  ) : null}
                </>
              ) : (
                <span>등록된 캐릭터 없음</span>
              )}
            </div>

            {displayCharacter?.type === "AGENT" && displayCharacter.play ? (
              <div className={styles.charMini__vitals}>
                <CharVital
                  label="HP"
                  value={displayCharacter.play.hp}
                  max={300}
                  tone="gold"
                />
                <CharVital
                  label="SAN"
                  value={displayCharacter.play.san}
                  max={100}
                  tone={displayCharacter.play.san < 30 ? "danger" : "info"}
                />
              </div>
            ) : null}

            <div className={styles.commandActions}>
              <Button
                as="a"
                href={
                  displayCharacter
                    ? `/erp/characters/${String(displayCharacter._id)}`
                    : "/erp/characters"
                }
                variant="primary"
                className={styles.primaryPill}
              >
                {displayCharacter ? "캐릭터 시트" : "캐릭터 확인"}
              </Button>
              <Link href="/erp/credits" className={styles.secondaryPill}>
                크레딧 확인
              </Link>
            </div>
          </div>
        </article>

        <article className={`${styles.commandSurface} ${styles.missionStage}`}>
          <div className={styles.sectionHead}>
            <div>
              <span className={styles.sectionLabel}>다음 작전</span>
              <h3>Mission Brief</h3>
            </div>
            {nextMissionMeta ? (
              <Tag tone={nextMissionMeta.tone}>{nextMissionMeta.label}</Tag>
            ) : null}
          </div>

          {nextMission ? (
            <>
              <div className={styles.missionStage__date}>
                <strong>{ddayLabel(nextMission.targetDateTime)}</strong>
                <span>{dateTimeLabel(nextMission.targetDateTime)} KST</span>
              </div>
              <h2 className={styles.missionStage__title}>{nextMission.title}</h2>
              <div className={styles.commandActions}>
                <Button
                  as="a"
                  href="/erp/sessions"
                  variant="primary"
                  className={styles.primaryPill}
                >
                  작전 보기
                </Button>
                <Link
                  href={buildDiscordLink(nextMission)}
                  className={styles.secondaryPill}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Discord
                </Link>
              </div>
            </>
          ) : (
            <div className={styles.softEmpty}>
              <strong>작전 대기</strong>
              <span>참여 예정 작전이 없습니다.</span>
              <Link href="/erp/sessions" className={styles.secondaryPill}>
                세션 달력
              </Link>
            </div>
          )}
        </article>

        <aside className={`${styles.commandSurface} ${styles.actionQueue}`}>
          <div className={styles.sectionHead}>
            <div>
              <span className={styles.sectionLabel}>처리할 일</span>
              <h3>Action Queue</h3>
            </div>
            <span className={styles.queueCount}>{actionItems.length}</span>
          </div>

          {actionItems.length === 0 ? (
            <div className={styles.softEmpty}>
              <strong>정상 운용</strong>
              <span>즉시 확인할 항목이 없습니다.</span>
            </div>
          ) : (
            <div className={styles.actionList}>
              {actionItems.slice(0, 4).map((item) => (
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
        </aside>
      </section>

      <section className={styles.signalStrip} aria-label="운용 지표">
        <Link href="/erp/credits" className={styles.signalItem}>
          <span>운용 크레딧</span>
          <strong className={styles.signalItem__gold}>¤ {balance.toLocaleString()}</strong>
        </Link>
        <Link href="/erp/sessions" className={styles.signalItem}>
          <span>응답 대기</span>
          <strong>{pendingResponse.length}</strong>
        </Link>
        <Link href="/erp/sessions" className={styles.signalItem}>
          <span>진행 세션</span>
          <strong>{openMissionCount}</strong>
        </Link>
        <Link href="/erp/notifications" className={styles.signalItem}>
          <span>미확인 알림</span>
          <strong>{unreadCount}</strong>
        </Link>
        <Link href="/erp/characters" className={styles.signalItem}>
          <span>보유 캐릭터</span>
          <strong>{myCharRefs.length}</strong>
        </Link>
        <Link href="/erp/wiki" className={styles.signalItem}>
          <span>작성 위키</span>
          <strong>{myWikiCount}</strong>
        </Link>
        <div className={styles.signalItem}>
          <span>누적 작전</span>
          <strong>{mySessionCount !== null ? mySessionCount : "—"}</strong>
        </div>
        <div className={styles.signalItem}>
          <span>가입 후</span>
          <strong>{joinedDays}D</strong>
        </div>
      </section>

      {mainIntegrityError ? (
        <section className={styles.alertBand} aria-label="캐릭터 정합성 경고">
          <strong>메인 캐릭터 정합성 확인 필요</strong>
          <span>{mainIntegrityError}</span>
          <Link href="/erp/characters" className={styles.secondaryPill}>
            캐릭터 확인
          </Link>
        </section>
      ) : null}

      <div className={styles.operationsGrid}>
        <section className={styles.surfacePanel}>
          <div className={styles.sectionHead}>
            <div>
              <span className={styles.sectionLabel}>내 작전</span>
              <h3>Mission Queue</h3>
            </div>
            <Link href="/erp/sessions" className={styles.panelLink}>
              달력
            </Link>
          </div>

          {!viewerDiscordId ? (
            <div className={styles.softEmpty}>
              <strong>Discord 연동 필요</strong>
              <span>연동 후 내 작전이 표시됩니다.</span>
              <Link href="/erp/account" className={styles.secondaryPill}>
                계정 설정
              </Link>
            </div>
          ) : myRsvpUpcoming.length === 0 ? (
            <div className={styles.softEmpty}>예정된 작전 없음</div>
          ) : (
            <div className={styles.sessionList}>
              {myRsvpUpcoming.map(({ raw: s }) => {
                const meta = SESSION_STATUS_TAG[s.status] ?? {
                  label: s.status,
                  tone: "default" as const,
                };
                const link = buildDiscordLink(s);
                return (
                  <div key={String(s._id)} className={styles.sessionCard}>
                    <div className={styles.sessionCard__code}>
                      <strong>{formatDate(s.targetDateTime, "compact")}</strong>
                      <span>{formatTime(s.targetDateTime)}</span>
                    </div>
                    <div className={styles.sessionCard__body}>
                      <div className={styles.sessionCard__title}>{s.title}</div>
                      <Tag tone={meta.tone}>{meta.label}</Tag>
                    </div>
                    <Link
                      href={link}
                      className={styles.iconLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${s.title} · 디스코드에서 열기`}
                    >
                      ↗
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className={styles.surfacePanel}>
          <div className={styles.sectionHead}>
            <div>
              <span className={styles.sectionLabel}>응답 필요</span>
              <h3>Tasks</h3>
            </div>
            <span className={styles.queueCount}>{pendingResponse.length}</span>
          </div>

          {!viewerDiscordId ? (
            <div className={styles.softEmpty}>Discord 연동 필요</div>
          ) : pendingResponse.length === 0 ? (
            <div className={styles.softEmpty}>응답 필요 작전 없음</div>
          ) : (
            <div className={styles.taskList}>
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
                      href="/erp/sessions"
                      className={styles.taskTitle}
                      title={s.title}
                    >
                      {s.title}
                    </Link>
                    <Link
                      href={link}
                      className={styles.textAction}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      응답
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <div className={styles.intelGrid}>
        <section className={styles.surfacePanel}>
          <div className={styles.sectionHead}>
            <div>
              <span className={styles.sectionLabel}>알림</span>
              <h3>Notifications</h3>
            </div>
            <Link href="/erp/notifications" className={styles.panelLink}>
              전체
            </Link>
          </div>

          {notificationPreview.length === 0 ? (
            <div className={styles.softEmpty}>새 알림 없음</div>
          ) : (
            <div className={styles.notifList}>
              {notificationPreview.map((n) => {
                const meta = NOTIFICATION_TAG[n.type];
                return (
                  <div
                    key={String(n._id)}
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
                    <span className={styles.timeText}>{formatTime(n.createdAt)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className={styles.surfacePanel}>
          <div className={styles.sectionHead}>
            <div>
              <span className={styles.sectionLabel}>최근 변경</span>
              <h3>Wiki Changes</h3>
            </div>
            <Link href="/erp/wiki" className={styles.panelLink}>
              전체
            </Link>
          </div>

          {recentWikis.length === 0 ? (
            <div className={styles.softEmpty}>최근 변경 내역 없음</div>
          ) : (
            <div className={styles.wikiList}>
              {recentWikis.map((w) => (
                <div key={String(w._id)} className={styles.wikiRow}>
                  <Link
                    href={`/erp/wiki/${String(w._id)}`}
                    className={styles.wikiLink}
                  >
                    {w.title}
                  </Link>
                  <span className={styles.timeText}>
                    {formatDate(w.updatedAt, "compact")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      </div>
    </>
  );
}
