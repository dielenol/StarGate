"use client";

import Image from "next/image";
import Link from "next/link";

import { useDashboard } from "@/hooks/queries/useDashboardQuery";
import { preferOptimizedPublicImagePath, resolvePublicAssetPath } from "@/lib/asset-path";
import { getPixelCharacterPath } from "@/lib/assets/characters";
import { finalCharacterStat } from "@/lib/character/stats";
import { formatDate, formatTime } from "@/lib/format/date";
import { getCharacterRoleLine, isDisplayableCharacterText } from "@/lib/format/character-display";

import type { ErpDashboardResponse } from "@/types/erp-realtime";
import type { NotificationType } from "@/types/notification";
import type { SessionStatus } from "@/types/session";

import type { IconComponent } from "@/components/icons";
import {
  IconAgentProfile,
  IconApply,
  IconAwaiting,
  IconCredit,
  IconHp,
  IconNotification,
  IconRecentChanges,
  IconSan,
  IconSession,
  IconTasks,
} from "@/components/icons";
import Bar from "@/components/ui/Bar/Bar";
import Button from "@/components/ui/Button/Button";
import PageHead from "@/components/ui/PageHead/PageHead";
import Seal from "@/components/ui/Seal/Seal";
import Tag, { rankTone } from "@/components/ui/Tag/Tag";

import styles from "./page.module.css";

/**
 * MY CHARACTER 아바타 — pixel-character (도트 풀샷) 우선, 폴백 chain:
 *   1. /assets/peoples/<Slug>-pixel-character.webp (codename → slug 매핑)
 *   2. previewImage (pixel-profile 도트)
 *   3. Seal initial 글자
 */
function CharAvatar({
  codename,
  pixelCharacterImage,
  previewImage,
  initial,
  variant = "mini",
}: {
  codename: string;
  pixelCharacterImage?: string | null;
  previewImage: string;
  initial: string;
  variant?: "mini" | "hero";
}) {
  const pixelChar = pixelCharacterImage
    ? preferOptimizedPublicImagePath(pixelCharacterImage)
    : getPixelCharacterPath(codename);
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
          loading={variant === "hero" ? "eager" : undefined}
          sizes={variant === "hero" ? "(max-width: 620px) 110px, (max-width: 900px) 200px, (max-width: 1100px) 240px, 280px" : "112px"}
          className={styles.charMini__avatarImg}
        />
      </div>
    );
  }
  return (
    <div className={avatarClassName}>
      <Seal size={variant === "hero" ? "lg" : "sm"} className={variant === "hero" ? styles.charMini__seal : undefined}>{initial}</Seal>
    </div>
  );
}

/** MY CHARACTER VITALS 한 줄 — 라벨 + 값/max + Bar */
/** HP/SAN 라벨 → 전용 아이콘 (캐릭터 상세/목록과 동일 도안). */
const VITAL_ICON: Record<string, IconComponent> = {
  HP: IconHp,
  SAN: IconSan,
};

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
  const VitalIcon = VITAL_ICON[label];
  return (
    <div className={styles.charMini__vital}>
      <div className={styles.charMini__vitalHead}>
        <span className={styles.charMini__vitalLabel}>
          {VitalIcon ? (
            <VitalIcon
              width={13}
              height={13}
              className={styles.charMini__vitalIcon}
            />
          ) : null}
          {label}
        </span>
        <span className={styles.charMini__vitalValue}>
          <b>{value}</b>
          <span className={styles.charMini__vitalMax}>/{max}</span>
        </span>
      </div>
      <Bar value={value} max={max} tone={tone} />
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
  STOCK: { label: "주식", tone: "gold" },
  HONOR: { label: "공적", tone: "gold" },
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
  const dayMs = 24 * 60 * 60 * 1000;
  const kstOffsetMs = 9 * 60 * 60 * 1000;
  return Math.floor((target.getTime() + kstOffsetMs) / dayMs)
    - Math.floor((Date.now() + kstOffsetMs) / dayMs);
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

export default function DashboardClient({
  initialData,
}: {
  initialData: ErpDashboardResponse;
}) {
  const { data, isError, isFetching, refetch } = useDashboard({ initialData });
  const initialDashboard = data ?? initialData;
  const {
    balance,
    isGuest,
    actionSummary,
    characterPointBalance,
    characterPointHref,
    displayCharacter,
    mainIntegrityError,
    notificationPreview,
    pendingResponseCount,
    sessionUnavailableSources,
    recentWikis,
    unreadCount,
  } = initialDashboard;
  const pendingUnavailable = sessionUnavailableSources.includes("registra");
  const sessionUnavailable = sessionUnavailableSources.length > 0;
  const unavailableSessionLabel = sessionUnavailableSources
    .map((source) => source === "registra" ? "ORDO" : "TRPG")
    .join(" · ");
  const actionUnavailable = actionSummary.unavailableDomains.length > 0;
  const characterRoleLine = displayCharacter ? getCharacterRoleLine(displayCharacter) : null;
  const characterClass = displayCharacter?.type === "AGENT" &&
    isDisplayableCharacterText(displayCharacter.play?.className)
    ? displayCharacter.play.className.trim()
    : null;
  const characterQuote = isDisplayableCharacterText(displayCharacter?.lore.quote)
    ? displayCharacter.lore.quote.trim()
    : null;
  const hasProfileSummary = Boolean(
    characterRoleLine || characterClass || characterQuote ||
    (displayCharacter?.type === "AGENT" && displayCharacter.play),
  );
  const viewerDiscordId = initialDashboard.discordLinked ? "linked" : null;
  const myRsvpUpcoming = initialDashboard.myRsvpUpcoming.map((raw) => ({
    raw,
  }));
  const pendingResponse = initialDashboard.pendingResponse.map((raw) => ({
    raw,
  }));
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
    !isGuest && !viewerDiscordId
      ? {
          label: "계정",
          title: "Discord 연동 필요",
          detail: "세션 RSVP와 내 작전 표시가 Discord 계정 기준으로 동작합니다.",
          href: "/erp/account",
          cta: "계정 설정",
          tone: "danger",
        }
      : null,
    pendingResponseCount > 0
      ? {
          label: "응답",
          title: `${pendingResponseCount}건의 세션 응답 대기`,
          detail: "모집중 또는 마감 임박 세션에 아직 RSVP가 없습니다.",
          href: pendingResponse[0]?.raw.href ?? "/erp/sessions",
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
  ].filter((item): item is ActionItem => item !== null);
  return (
    <>
      <PageHead
        breadcrumb={[{ label: "ERP" }, { label: "HOME" }]}
        title="대시보드"
      />

      <div className={styles.dashboard}>
        {isError ? (
          <div className={styles.alertBand} role="status">
            <span>최신 정보를 가져오지 못해 마지막으로 확인한 내용을 표시하고 있습니다.</span>
            <Button onClick={() => void refetch()} disabled={isFetching} variant="default">다시 확인</Button>
          </div>
        ) : null}
        <section className={styles.commandCenter} aria-label="운영 홈">
          <article className={`${styles.commandSurface} ${styles.agentStage} ${!hasProfileSummary ? styles["agentStage--compact"] : ""}`}>
            <div className={styles.agentStage__portrait} aria-hidden="true">
              {displayCharacter ? (
                <CharAvatar
                  codename={displayCharacter.codename}
                  pixelCharacterImage={displayCharacter.pixelCharacterImage}
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
                  <Seal size="lg" className={styles.charMini__seal}>ERP</Seal>
                </div>
              )}
              <span className={styles.agentStage__portraitCaption}>
                {displayCharacter?.codename || "PERSONNEL"}
              </span>
            </div>

            <div className={styles.agentStage__content}>
              <span className={styles.sectionLabel}><IconAgentProfile className={styles.sectionLabel__icon} aria-hidden />PERSONNEL <span className={styles.sectionLabel__divider}>/</span> 요원 작전실</span>
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

              {hasProfileSummary ? (
                <div className={styles.agentStage__brief}>
                  {characterRoleLine || characterClass ? (
                    <dl className={styles.agentStage__details}>
                      {characterRoleLine ? (
                        <div><dt>직책 · 부서</dt><dd>{characterRoleLine}</dd></div>
                      ) : null}
                      {characterClass ? (
                        <div><dt>직군</dt><dd>{characterClass}</dd></div>
                      ) : null}
                    </dl>
                  ) : null}
                  {characterQuote ? (
                    <blockquote className={styles.agentStage__quote} title={characterQuote}>
                      <span aria-hidden="true">“</span>
                      <p>{characterQuote}</p>
                    </blockquote>
                  ) : null}

                  {displayCharacter?.type === "AGENT" && displayCharacter.play ? (
                    <div className={styles.charMini__vitals}>
                      <CharVital
                        label="HP"
                        value={finalCharacterStat(displayCharacter.play.hp, displayCharacter.play.hpDelta)}
                        max={300}
                        tone="gold"
                      />
                      <CharVital
                        label="SAN"
                        value={finalCharacterStat(displayCharacter.play.san, displayCharacter.play.sanDelta)}
                        max={100}
                        tone={finalCharacterStat(displayCharacter.play.san, displayCharacter.play.sanDelta) < 30 ? "danger" : "info"}
                      />
                    </div>
                  ) : null}
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
                  variant="default"
                  className={styles.secondaryPill}
                >
                  {displayCharacter ? "캐릭터 시트" : "캐릭터 확인"}<span aria-hidden="true"> ↗</span>
                </Button>
                <Link href="/erp/credits" className={styles.secondaryPill}>
                  크레딧 확인
                </Link>
              </div>
            </div>
          </article>

          <section className={styles.signalStrip} aria-label="운용 지표">
            <Link href="/erp/credits" className={styles.signalItem}>
              <span><IconCredit className={styles.signalItem__icon} aria-hidden />운용 크레딧</span>
              <strong className={styles.signalItem__gold}>¤ {balance.toLocaleString()}</strong>
              <small>메인 캐릭터의 잔액</small>
            </Link>
            <Link href={characterPointHref} className={styles.signalItem}>
              <span><IconCredit className={styles.signalItem__icon} aria-hidden />잔여 포인트</span>
              <strong>
                {characterPointBalance !== null
                  ? `PT ${characterPointBalance.toLocaleString()}`
                  : "—"}
              </strong>
              <small>캐릭터 시트 기준</small>
            </Link>
            <Link href="/erp/sessions" className={styles.signalItem}>
              <span><IconAwaiting className={styles.signalItem__icon} aria-hidden />확인할 응답</span>
              <strong>{pendingUnavailable || isGuest || !viewerDiscordId ? "—" : pendingResponseCount}</strong>
              <small>{pendingUnavailable ? "ORDO 일정을 확인하지 못했습니다" : "ORDO의 전체 미응답 작전"}</small>
            </Link>
            <Link href="/erp/notifications" className={styles.signalItem}>
              <span><IconNotification className={styles.signalItem__icon} aria-hidden />미확인 알림</span>
              <strong>{unreadCount}</strong>
              <small>읽지 않은 개인 알림</small>
            </Link>
          </section>
        </section>

        <div className={styles.workbench}>
          <article className={`${styles.commandSurface} ${styles.missionStage}`}>
            <Image
              src={resolvePublicAssetPath("/assets/world-view/novus-ordo-world-map.webp")}
              alt=""
              fill
              sizes="(max-width: 900px) 100vw, 50vw"
              className={styles.missionStage__map}
            />
            <div className={styles.sectionHead}>
              <div>
                <span className={styles.sectionLabel}><IconApply className={styles.sectionLabel__icon} aria-hidden />MISSION BRIEF</span>
                <h3>다음 작전</h3>
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
                    href={nextMission.href}
                    variant="primary"
                    className={styles.primaryPill}
                  >
                    작전 보기
                  </Button>
                  {nextMission.externalHref ? <Link
                    href={nextMission.externalHref}
                    className={styles.secondaryPill}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {nextMission.externalLabel}
                  </Link> : null}
                </div>
              </>
            ) : (
              <div className={styles.missionStage__standby}>
                <span className={styles.missionStage__standbyLabel} aria-hidden="true">AWAITING NEXT OPERATION</span>
                <strong>{sessionUnavailable ? "예정 작전을 확인하지 못했습니다" : "지금은 작전 대기 중"}</strong>
                <span>{sessionUnavailable ? "일부 일정 조회가 지연되고 있습니다." : "세션 달력에서 다음 작전을 확인하세요."}</span>
                <Link href="/erp/sessions" className={styles.primaryPill}>
                  세션 달력
                </Link>
              </div>
            )}
            {sessionUnavailable ? (
              <p className={styles.queueHint} role="status">{unavailableSessionLabel} 조회 지연 · 표시된 일정 외에 참여 작전이 있을 수 있습니다.</p>
            ) : null}
          </article>

          <aside className={`${styles.commandSurface} ${styles.actionQueue}`}>
            <div className={styles.sectionHead}>
              <div>
                <span className={styles.sectionLabel}><IconTasks className={styles.sectionLabel__icon} aria-hidden />ACTION QUEUE</span>
                <h3>처리할 일</h3>
              </div>
              <span className={styles.queueCount} aria-label={`처리할 업무 ${actionSummary.totalCount}건${actionUnavailable ? " 이상" : ""}`}>
                {actionSummary.totalCount}{actionUnavailable ? "+" : ""}
              </span>
            </div>

            {actionSummary.domains.length > 0 ? (
              <div className={styles.queueDomains} aria-label="업무별 전체 목록">
                {actionSummary.domains.map((domain) => (
                  <Link key={domain.key} href={domain.href} className={styles.panelLink}>
                    {domain.label} {domain.count === null ? "확인 필요" : `${domain.count}건`}
                  </Link>
                ))}
              </div>
            ) : null}
            {actionUnavailable ? (
              <p className={styles.queueHint} role="status">일부 업무를 조회하지 못했습니다. 위 업무별 목록에서 다시 확인하세요.</p>
            ) : null}
            {actionSummary.items.length === 0 ? (
              <div className={styles.softEmpty}>
                <strong>{isGuest ? "둘러보기 모드" : actionUnavailable ? "업무 확인 필요" : "지금 처리할 업무가 없습니다"}</strong>
                <span>{isGuest ? "로그인하면 내 업무가 표시됩니다." : actionUnavailable ? "조회가 완료된 업무만 반영했습니다." : "내 견적 검토 · 교환 확정 · 연구 수령 등을 모아 보여줍니다."}</span>
              </div>
            ) : (
              <div className={styles.actionList} aria-label="처리할 업무">
                {actionSummary.items.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={styles.actionItem}
                  >
                    <span className={styles.actionItem__marker} data-tone={item.tone} aria-hidden="true" />
                    <span className={styles.actionItem__body}>
                      <span className={styles.actionItem__category}>{item.label}</span>
                      <span className={styles.actionItem__title}>{item.title}</span>
                      <span className={styles.actionItem__detail}>{item.detail}</span>
                      {item.deadlineAt ? <span className={styles.actionItem__deadline}>수령 기한 · {dateTimeLabel(item.deadlineAt)} KST</span> : null}
                    </span>
                    <span className={styles.actionItem__cta}>{item.cta}<span aria-hidden="true"> ↗</span></span>
                  </Link>
                ))}
              </div>
            )}
            {actionSummary.totalCount > actionSummary.items.length ? (
              <p className={styles.queueHint}>우선 확인할 {actionSummary.items.length}건을 표시합니다. 나머지는 업무별 목록에서 확인하세요.</p>
            ) : null}
            {actionItems.length > 0 ? (
              <div className={styles.queueNotices} aria-label="함께 확인할 사항">
                {actionItems.map((item) => (
                  <Link key={item.label} href={item.href} className={styles.queueNotice} title={item.detail}>
                    <span className={styles.actionItem__marker} data-tone={item.tone} aria-hidden="true" />
                    <span>{item.title}</span>
                    <span className={styles.actionItem__cta}>{item.cta} ↗</span>
                  </Link>
                ))}
              </div>
            ) : null}
          </aside>
        </div>

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
                <span className={styles.sectionLabel}><IconSession className={styles.sectionLabel__icon} aria-hidden />MISSION QUEUE</span>
                <h3>내 작전</h3>
              </div>
              <Link href="/erp/sessions" className={styles.panelLink}>
                달력
              </Link>
            </div>

            {isGuest ? (
              <div className={styles.softEmpty}>로그인하면 참여 예정 작전이 표시됩니다.</div>
            ) : !viewerDiscordId ? (
              <div className={styles.softEmpty}>
                <strong>Discord 연동 필요</strong>
                <span>연동 후 내 작전이 표시됩니다.</span>
                <Link href="/erp/account" className={styles.secondaryPill}>
                  계정 설정
                </Link>
              </div>
            ) : myRsvpUpcoming.length === 0 ? (
              <div className={styles.softEmpty}>{sessionUnavailable ? "일부 일정을 확인하지 못했습니다" : "예정된 작전 없음"}</div>
            ) : (
              <div className={styles.sessionList}>
                {myRsvpUpcoming.map(({ raw: s }) => {
                  const meta = SESSION_STATUS_TAG[s.status] ?? {
                    label: s.status,
                    tone: "default" as const,
                  };
                  return (
                    <div key={`${s.source}:${s._id}`} className={styles.sessionCard}>
                      <div className={styles.sessionCard__code}>
                        <strong>{formatDate(s.targetDateTime, "compact")}</strong>
                        <span>{formatTime(s.targetDateTime)}</span>
                      </div>
                      <div className={styles.sessionCard__body}>
                        <Link href={s.href} className={styles.sessionCard__title}>{s.title}</Link>
                        <Tag tone={meta.tone}>{meta.label}</Tag>
                        <span className={styles.timeText}>{s.source === "trpg" ? "TRPG" : "ORDO"}</span>
                      </div>
                      <Link
                        href={s.href}
                        className={styles.iconLink}
                        aria-label={`${s.title} · 세션 상세 열기`}
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
                <span className={styles.sectionLabel}><IconTasks className={styles.sectionLabel__icon} aria-hidden />RESPONSE REQUIRED</span>
                <h3>응답 필요</h3>
              </div>
              <span className={styles.queueCount}>{pendingUnavailable || isGuest || !viewerDiscordId ? "—" : pendingResponseCount}</span>
            </div>

            {isGuest ? (
              <div className={styles.softEmpty}>로그인 후 확인할 수 있습니다.</div>
            ) : !viewerDiscordId ? (
              <div className={styles.softEmpty}>Discord 연동 필요</div>
            ) : pendingResponse.length === 0 ? (
              <div className={styles.softEmpty}>{pendingUnavailable ? "응답할 작전을 확인하지 못했습니다" : "응답 필요 작전 없음"}</div>
            ) : (
              <div className={styles.taskList}>
                {pendingResponse.map(({ raw: s }) => {
                  const tone = s.status === "CLOSING" ? "danger" : "gold";
                  return (
                    <div
                      key={`${s.source}:${s._id}`}
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
                        href={s.href}
                        className={styles.taskTitle}
                        title={s.title}
                      >
                        {s.title}
                      </Link>
                      <Link
                        href={s.href}
                        className={styles.textAction}
                      >
                        응답
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}
            {pendingResponseCount > pendingResponse.length ? (
              <Link href="/erp/sessions" className={styles.panelLink}>전체 {pendingResponseCount}건 · 세션 달력에서 확인 ↗</Link>
            ) : null}
          </section>
        </div>

        <div className={styles.intelGrid}>
          <section className={styles.surfacePanel}>
            <div className={styles.sectionHead}>
              <div>
                <span className={styles.sectionLabel}><IconNotification className={styles.sectionLabel__icon} aria-hidden />NOTIFICATIONS</span>
                <h3>알림</h3>
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
                <span className={styles.sectionLabel}><IconRecentChanges className={styles.sectionLabel__icon} aria-hidden />RECENT CHANGES</span>
                <h3>최근 변경</h3>
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
