import Link from "next/link";
import { redirect, notFound } from "next/navigation";

import { getActiveSession } from "@/lib/auth/active-session";
import { hasRole } from "@/lib/auth/rbac";
import { relatedCatalogItemsForReport } from "@/lib/catalog/related";
import { listCharacterRefs } from "@/lib/db/characters";
import { listMasterItemRefs } from "@/lib/db/inventory";
import {
  findReportById,
  listSessionReportRefs,
  sanitizeSessionReportReferencesForPublicTargets,
  type SessionReportRef,
} from "@/lib/db/session-reports";
import { isValidObjectId } from "@/lib/db/utils";
import { listWikiPages } from "@/lib/db/wiki";
import { formatDate } from "@/lib/format/date";
import {
  findOperationReportNumberMeta,
  formatOperationReportTitle,
  formatShortReporterName,
} from "@/lib/format/session-report";
import {
  formatRelatedPersonnelMeta,
  type RelatedPersonnelLink,
  relatedPersonnelLinkMatchesParticipant,
  relatedPersonnelForReport,
  relatedWikiForReport,
} from "@/lib/lore-links";
import { filterCharacterForLoreLinks, getUserClearance } from "@/lib/personnel";
import { buildWikiAutoLinkTargets } from "@/lib/wiki-auto-links";
import type { ClientSessionReport } from "@/types/session-report";

import { IconReportDocument, IconReportMini } from "@/components/icons";
import LinkPendingProbe from "@/components/erp/NavPending/LinkPendingProbe";
import Box from "@/components/ui/Box/Box";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import PageHead from "@/components/ui/PageHead/PageHead";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";

import ReportActions from "./ReportActions";
import ReportBodyContent from "./ReportBodyContent";

import styles from "./page.module.css";

interface Props {
  params: Promise<{ id: string }>;
}

function formatMapCoordinate(mapX?: number, mapY?: number): string {
  if (typeof mapX !== "number" || typeof mapY !== "number") return "미등록";
  return `${mapX.toFixed(2)} / ${mapY.toFixed(2)}`;
}

function formatMapPrecision(precision?: string): string {
  if (precision === "confirmed") return "확정";
  if (precision === "estimated") return "추정";
  return "미등록";
}

function findPersonnelForParticipant(
  participant: string,
  personnelLinks: RelatedPersonnelLink[],
): RelatedPersonnelLink | null {
  return (
    personnelLinks.find((personnel) =>
      relatedPersonnelLinkMatchesParticipant(participant, personnel),
    ) ?? null
  );
}

export default async function SessionReportDetailPage({ params }: Props) {
  const session = await getActiveSession();

  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;
  if (!isValidObjectId(id)) notFound();

  const rawReport = await findReportById(id);
  if (!rawReport) {
    notFound();
  }
  const [report] =
    await sanitizeSessionReportReferencesForPublicTargets([rawReport]);

  const isGmOrAbove = hasRole(session.user.role, "V");
  const isAdmin = hasRole(session.user.role, "GM");
  const reportId = String(report._id);
  const serializedReport: ClientSessionReport = {
    ...report,
    _id: reportId,
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt?.toISOString() ?? "",
  };
  const displayTitle = formatOperationReportTitle(report.sessionTitle);
  const shortReporterName = formatShortReporterName(report.gmName);
  const mapLocationLabel = report.locationLabel || "작전지 미등록";
  const mapCoordinate = formatMapCoordinate(report.mapX, report.mapY);
  const mapPrecision = formatMapPrecision(report.mapPrecision);
  const reportLead = report.locationLabel
    ? `${mapLocationLabel}에서 기록된 세션 작전 보고서. 본문은 원본 로그를 작전 개요, 시간대별 전개, 교전·격리 결과, 후속 문서로 재구성한다.`
    : "작전지 좌표가 아직 등록되지 않은 세션 작전 보고서. 본문은 원본 로그를 작전 개요, 시간대별 전개, 교전·격리 결과, 후속 문서로 재구성한다.";
  // 자동링크/연관 문서용 컬렉션 4종 — 서로 독립 조회라 병렬 로드 (실패 시 빈 목록).
  // 캐릭터/아이템/보고서는 ref projection (lore 서사/play/summary 등 미전송).
  // 위키는 relatedWikiForReport 가 본문(content) 스캔에 의존하므로 full 로드 유지.
  const [allPages, allCharacters, allItems, allReports] = await Promise.all([
    listWikiPages({ includePrivate: isGmOrAbove }).catch(() => []),
    listCharacterRefs().catch(() => []),
    listMasterItemRefs().catch(() => []),
    listSessionReportRefs().catch(() => [report]),
  ]);
  const reportNumberMeta = findOperationReportNumberMeta<SessionReportRef>(
    report,
    allReports,
  );
  const reportCode = reportNumberMeta.number;
  const isMiniReport = reportNumberMeta.series === "mini";
  const ReportIcon = isMiniReport ? IconReportMini : IconReportDocument;
  const reportEyebrow = isMiniReport
    ? "MINI OPERATION REPORT"
    : "OPERATION REPORT";
  const visibleCharacters = isAdmin
    ? allCharacters
    : allCharacters.filter((character) => character.isPublic !== false);
  // 실명/닉네임은 wiki 상세와 동일하게 clearance 마스킹 후 링크·패널에 투입
  // (2026-07-31 정책 확정 — 보고서 화면도 clearanceOverrides 존중).
  const userClearance = getUserClearance(session.user.role);
  const linkableCharacters = visibleCharacters.map((character) =>
    filterCharacterForLoreLinks(character, userClearance),
  );
  const visibleItems = isGmOrAbove
    ? allItems
    : allItems.filter((item) => item.isPublic !== false);
  const visibleWikiPages = isGmOrAbove
    ? allPages
    : allPages.filter((page) => page.isPublic === true);
  const linkableReports = allReports.filter(
    (candidate) => String(candidate._id) !== reportId,
  );
  const autoLinkTargets = buildWikiAutoLinkTargets({
    catalogItems: visibleItems,
    characters: linkableCharacters,
    reports: linkableReports,
    wikiPages: visibleWikiPages,
  });
  // 비공개(unlisted) 위키는 연관 카드 후보에서도 제외 — 같은 페이지의 다른 목록과 동일 필터.
  const relatedWikiLinks = relatedWikiForReport(report, visibleWikiPages);
  const relatedCatalogItems = relatedCatalogItemsForReport(report, visibleItems);
  const relatedPersonnelLinks = relatedPersonnelForReport(
    report,
    linkableCharacters,
  );
  const participantEntries = report.participants.map((participant) => ({
    label: participant,
    personnel: findPersonnelForParticipant(participant, relatedPersonnelLinks),
  }));
  const linkedParticipantIds = new Set(
    participantEntries
      .map((entry) => entry.personnel?.id)
      .filter((id): id is string => Boolean(id)),
  );
  const relatedContextPersonnelLinks = relatedPersonnelLinks.filter(
    (personnel) => !linkedParticipantIds.has(personnel.id),
  );
  const personnelPanelTitle =
    participantEntries.length > 0 ? "참여 인원" : "관련 인물 기록";
  const personnelPanelCount =
    participantEntries.length > 0
      ? participantEntries.length
      : relatedContextPersonnelLinks.length;

  return (
    <>
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "세션", href: "/erp/sessions" },
          { label: "작전 보고서", href: "/erp/sessions/report" },
          { label: reportId.slice(-6).toUpperCase() },
        ]}
        title={displayTitle}
        right={
          isGmOrAbove || isAdmin ? (
            <ReportActions
              reportId={reportId}
              canEdit={isGmOrAbove}
              canDelete={isAdmin}
              expectedUpdatedAt={serializedReport.updatedAt}
            />
          ) : null
        }
      />

      <div data-pixel-font="ui">
      <section
        className={[
          styles.dossierHero,
          isMiniReport ? styles["dossierHero--mini"] : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-label="작전 보고서 요약"
      >
        <div className={styles.dossierHero__icon} aria-hidden="true">
          <ReportIcon />
        </div>
        <div className={styles.dossierHero__body}>
          <Eyebrow tone="gold">{reportEyebrow}</Eyebrow>
          <h2 className={styles.dossierHero__title}>{displayTitle}</h2>
          <p className={styles.dossierHero__lead}>{reportLead}</p>
        </div>
        <dl className={styles.dossierHero__meta}>
          <div className={styles.dossierMetric}>
            <dt>기록 번호</dt>
            <dd>{reportCode}</dd>
          </div>
          <div className={styles.dossierMetric}>
            <dt>보고자</dt>
            <dd>{shortReporterName}</dd>
          </div>
          <div className={styles.dossierMetric}>
            <dt>작전지</dt>
            <dd>{mapLocationLabel}</dd>
          </div>
        </dl>
      </section>

      <div className={styles.layout}>
        <div className={styles.side}>
          <Box className={styles.reportPanel}>
            <PanelTitle>기록 정보</PanelTitle>
            <dl className={styles.kv}>
              <div className={styles.kv__row}>
                <dt>보고자</dt>
                <dd className={styles.kv__gm}>{report.gmName}</dd>
              </div>
              <div className={styles.kv__row}>
                <dt>보고일</dt>
                <dd className={styles.mono}>{formatDate(report.createdAt, "long")}</dd>
              </div>
              {report.updatedAt &&
              new Date(report.updatedAt).getTime() !==
                new Date(report.createdAt).getTime() ? (
                <div className={styles.kv__row}>
                  <dt>수정일</dt>
                  <dd className={styles.mono}>{formatDate(report.updatedAt, "long")}</dd>
                </div>
              ) : null}
              <div className={styles.kv__row}>
                <dt>세션 ID</dt>
                <dd className={styles.mono}>{report.sessionId.slice(-8)}</dd>
              </div>
              <div className={styles.kv__row}>
                <dt>작전지</dt>
                <dd>{mapLocationLabel}</dd>
              </div>
              <div className={styles.kv__row}>
                <dt>지도 좌표</dt>
                <dd className={styles.mono}>{mapCoordinate}</dd>
              </div>
              <div className={styles.kv__row}>
                <dt>좌표 상태</dt>
                <dd>{mapPrecision}</dd>
              </div>
            </dl>
          </Box>

          {relatedWikiLinks.length > 0 ? (
            <Box className={styles.reportPanel}>
              <PanelTitle
                right={
                  <span className={styles.mono}>
                    {relatedWikiLinks.length}
                  </span>
                }
              >
                관련 위키
              </PanelTitle>
              <nav className={styles.relatedWiki} aria-label="관련 위키 문서">
                {relatedWikiLinks.map((page) => (
                  <Link
                    key={page.id}
                    href={`/erp/wiki/${page.id}`}
                    className={styles.relatedWiki__link}
                  >
                    <LinkPendingProbe />
                    <span className={styles.relatedWiki__category}>
                      {page.category}
                    </span>
                    <span className={styles.relatedWiki__title}>
                      {page.title}
                    </span>
                  </Link>
                ))}
              </nav>
            </Box>
          ) : null}

          {relatedCatalogItems.length > 0 ? (
            <Box className={styles.reportPanel}>
              <PanelTitle
                right={
                  <span className={styles.mono}>
                    {relatedCatalogItems.length}
                  </span>
                }
              >
                관련 카탈로그
              </PanelTitle>
              <nav
                className={styles.relatedWiki}
                aria-label="관련 카탈로그 항목"
              >
                {relatedCatalogItems.map((item) => (
                  <Link
                    key={item.key}
                    href={`/erp/wiki/catalog/item/${encodeURIComponent(item.key)}`}
                    className={styles.relatedWiki__link}
                  >
                    <LinkPendingProbe />
                    <span className={styles.relatedWiki__category}>
                      {item.categoryLabel}
                    </span>
                    <span className={styles.relatedWiki__title}>
                      {item.name}
                    </span>
                    {item.effect ? (
                      <span className={styles.relatedWiki__note}>
                        {item.effect}
                      </span>
                    ) : null}
                  </Link>
                ))}
              </nav>
            </Box>
          ) : null}

          {participantEntries.length > 0 ||
          relatedContextPersonnelLinks.length > 0 ? (
            <Box className={styles.reportPanel}>
              <PanelTitle
                right={
                  <span className={styles.mono}>
                    {personnelPanelCount}
                  </span>
                }
              >
                {personnelPanelTitle}
              </PanelTitle>
              {participantEntries.length > 0 ? (
                <nav className={styles.participantList} aria-label="참여 인원">
                  {participantEntries.map((entry, index) =>
                    entry.personnel ? (
                      <Link
                        key={`${entry.label}-${index}`}
                        href={`/erp/personnel/${entry.personnel.id}`}
                        className={styles.participantLink}
                      >
                        <LinkPendingProbe />
                        <span className={styles.participantLink__label}>
                          {entry.label}
                        </span>
                        <span className={styles.participantLink__meta}>
                          인물 기록 · {entry.personnel.name}
                        </span>
                      </Link>
                    ) : (
                      <span
                        key={`${entry.label}-${index}`}
                        className={styles.participantChip}
                      >
                        {entry.label}
                      </span>
                    ),
                  )}
                </nav>
              ) : null}

              {relatedContextPersonnelLinks.length > 0 ? (
                <div className={styles.contextPersonnel}>
                  <div className={styles.contextPersonnel__label}>
                    관련 인물 기록
                    <span className={styles.contextPersonnel__count}>
                      {relatedContextPersonnelLinks.length}
                    </span>
                  </div>
                  <nav
                    className={styles.relatedWiki}
                    aria-label="관련 인물 기록"
                  >
                    {relatedContextPersonnelLinks.map((character) => (
                      <Link
                        key={character.id}
                        href={`/erp/personnel/${character.id}`}
                        className={styles.relatedWiki__link}
                      >
                        <LinkPendingProbe />
                        <span className={styles.relatedWiki__category}>
                          {formatRelatedPersonnelMeta(character)}
                        </span>
                        <span className={styles.relatedWiki__title}>
                          {character.name}
                        </span>
                        <span className={styles.relatedWiki__note}>
                          {character.codename} · {character.role}
                        </span>
                      </Link>
                    ))}
                  </nav>
                </div>
              ) : null}
            </Box>
          ) : null}
        </div>

        <div className={styles.main}>
          <ReportBodyContent
            initialReport={serializedReport}
            links={autoLinkTargets}
          />
        </div>
      </div>
      </div>
    </>
  );
}
