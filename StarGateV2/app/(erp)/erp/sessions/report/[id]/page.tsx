import Link from "next/link";
import { redirect, notFound } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import { relatedCatalogItemsForReport } from "@/lib/catalog/related";
import { listCharacters } from "@/lib/db/characters";
import { listMasterItems } from "@/lib/db/inventory";
import { findReportById } from "@/lib/db/session-reports";
import { isValidObjectId } from "@/lib/db/utils";
import { listWikiPages } from "@/lib/db/wiki";
import { formatDate } from "@/lib/format/date";
import {
  formatOperationReportTitle,
  formatShortReporterName,
} from "@/lib/format/session-report";
import {
  type RelatedPersonnelLink,
  type RelatedWikiLink,
  relatedPersonnelForReport,
  relatedWikiForReport,
} from "@/lib/lore-links";
import { resolvePublicAssetPath } from "@/lib/asset-path";
import { renderMarkdown } from "@/lib/wiki-render";
import type { WikiPage } from "@stargate/shared-db/types";

import { IconReportDocument } from "@/components/icons";
import Box from "@/components/ui/Box/Box";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import PageHead from "@/components/ui/PageHead/PageHead";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";

import ReportActions from "./ReportActions";

import styles from "./page.module.css";

interface Props {
  params: Promise<{ id: string }>;
}

interface ReportSubjectVisual {
  id: string;
  title: string;
  category: string;
  src: string;
  alt: string;
  caption: string;
}

const REPORT_SUBJECT_IMAGE_LIMIT = 4;

function isLocalAssetImage(src: string): boolean {
  const trimmed = src.trim();
  if (trimmed.includes("..")) return false;
  return /^\/assets\/[A-Za-z0-9/_ .%()-]+\.(webp|png|jpe?g|gif|avif)$/i.test(
    trimmed,
  );
}

function stripInlineMarkdown(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .trim();
}

function firstMarkdownImage(
  content: string,
): Pick<ReportSubjectVisual, "src" | "alt" | "caption"> | null {
  for (const rawLine of content.split(/\r?\n/)) {
    const match = rawLine
      .trim()
      .match(/^!\[([^\]]*)\]\((\S+?)(?:\s+"([^"]*)")?\)$/);
    if (!match || !isLocalAssetImage(match[2])) continue;

    return {
      src: match[2].trim(),
      alt: stripInlineMarkdown(match[1].trim()),
      caption: stripInlineMarkdown((match[3] ?? match[1]).trim()),
    };
  }

  return null;
}

function isDirectCombatOrContainmentSubject(page: WikiPage): boolean {
  const targetText = [page.title, page.category, ...page.tags]
    .join(" ")
    .normalize("NFKC")
    .toUpperCase();

  if (/ZULU-\d{3,4}/u.test(targetText)) return true;

  const directTerms = [
    "개체",
    "격리 개체",
    "제압 개체",
    "전투 개체",
    "메인 빌런",
    "적대 개체",
  ];

  return directTerms.some((term) =>
    targetText.includes(term.normalize("NFKC").toUpperCase()),
  );
}

function pageId(page: Pick<WikiPage, "_id">): string | null {
  return page._id?.toString() ?? null;
}

function reportSubjectVisuals(
  relatedWikiLinks: RelatedWikiLink[],
  allPages: WikiPage[],
): ReportSubjectVisual[] {
  const pagesById = new Map(
    allPages
      .map((page) => [pageId(page), page] as const)
      .filter((entry): entry is readonly [string, WikiPage] =>
        Boolean(entry[0]),
      ),
  );
  const visuals: ReportSubjectVisual[] = [];

  for (const link of relatedWikiLinks) {
    const page = pagesById.get(link.id);
    if (!page || !isDirectCombatOrContainmentSubject(page)) continue;

    const image = firstMarkdownImage(page.content);
    if (!image) continue;

    visuals.push({
      id: link.id,
      title: page.title,
      category: page.category,
      ...image,
    });

    if (visuals.length >= REPORT_SUBJECT_IMAGE_LIMIT) break;
  }

  return visuals;
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

function normalizePersonnelLabel(value: string): string {
  return value
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function personnelLinkKeys(personnel: RelatedPersonnelLink): string[] {
  const keys = new Set<string>();

  for (const value of [
    personnel.codename,
    personnel.name,
    ...(personnel.aliases ?? []),
  ]) {
    const normalized = normalizePersonnelLabel(value);
    if (normalized) keys.add(normalized);
  }

  const baseCodename = personnel.codename.split(/[-(]/u)[0];
  const normalizedBase = normalizePersonnelLabel(baseCodename);
  if (normalizedBase) keys.add(normalizedBase);

  return [...keys];
}

function findPersonnelForParticipant(
  participant: string,
  personnelLinks: RelatedPersonnelLink[],
): RelatedPersonnelLink | null {
  const participantKey = normalizePersonnelLabel(participant);
  if (!participantKey) return null;

  return (
    personnelLinks.find((personnel) =>
      personnelLinkKeys(personnel).includes(participantKey),
    ) ?? null
  );
}

export default async function SessionReportDetailPage({ params }: Props) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;
  if (!isValidObjectId(id)) notFound();

  const report = await findReportById(id);
  if (!report) {
    notFound();
  }

  const isGmOrAbove = hasRole(session.user.role, "V");
  const isAdmin = hasRole(session.user.role, "GM");
  const reportId = String(report._id);
  const displayTitle = formatOperationReportTitle(report.sessionTitle);
  const summaryHtml = renderMarkdown(report.summary || "—");
  const reportCode = reportId.slice(-6).toUpperCase();
  const shortReporterName = formatShortReporterName(report.gmName);
  const mapLocationLabel = report.locationLabel || "작전지 미등록";
  const mapCoordinate = formatMapCoordinate(report.mapX, report.mapY);
  const mapPrecision = formatMapPrecision(report.mapPrecision);
  const reportLead = report.locationLabel
    ? `${mapLocationLabel}에서 기록된 세션 작전 보고서. 본문은 원본 로그를 작전 개요, 시간대별 전개, 교전·격리 결과, 후속 문서로 재구성한다.`
    : "작전지 좌표가 아직 등록되지 않은 세션 작전 보고서. 본문은 원본 로그를 작전 개요, 시간대별 전개, 교전·격리 결과, 후속 문서로 재구성한다.";
  const allPages = await listWikiPages().catch(() => []);
  const allCharacters = await listCharacters().catch(() => []);
  const allItems = await listMasterItems().catch(() => []);
  const visibleCharacters = isAdmin
    ? allCharacters
    : allCharacters.filter((character) => character.isPublic !== false);
  const visibleItems = isGmOrAbove
    ? allItems
    : allItems.filter((item) => item.isPublic !== false);
  const relatedWikiLinks = relatedWikiForReport(report, allPages);
  const relatedCatalogItems = relatedCatalogItemsForReport(report, visibleItems);
  const relatedPersonnelLinks = relatedPersonnelForReport(
    report,
    visibleCharacters,
  );
  const subjectVisuals = reportSubjectVisuals(relatedWikiLinks, allPages);
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
            />
          ) : null
        }
      />

      <section className={styles.dossierHero} aria-label="작전 보고서 요약">
        <div className={styles.dossierHero__icon} aria-hidden="true">
          <IconReportDocument />
        </div>
        <div className={styles.dossierHero__body}>
          <Eyebrow tone="gold">OPERATION REPORT</Eyebrow>
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
                        <span className={styles.relatedWiki__category}>
                          {character.type} · {character.agentLevel ?? "U"}
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
          {subjectVisuals.length > 0 ? (
            <Box className={styles.reportPanel}>
              <PanelTitle
                right={
                  <span className={styles.mono}>
                    {subjectVisuals.length}
                  </span>
                }
              >
                교전·격리 대상
              </PanelTitle>
              <div className={styles.subjectVisualGrid}>
                {subjectVisuals.map((visual) => (
                  <Link
                    key={visual.id}
                    href={`/erp/wiki/${visual.id}`}
                    className={styles.subjectVisual}
                  >
                    <div className={styles.subjectVisual__frame}>
                      <img
                        src={resolvePublicAssetPath(visual.src)}
                        alt={visual.alt || visual.title}
                        className={styles.subjectVisual__image}
                        loading="lazy"
                        decoding="async"
                      />
                    </div>
                    <div className={styles.subjectVisual__body}>
                      <span className={styles.subjectVisual__category}>
                        {visual.category}
                      </span>
                      <span className={styles.subjectVisual__title}>
                        {visual.title}
                      </span>
                      {visual.caption ? (
                        <span className={styles.subjectVisual__caption}>
                          {visual.caption}
                        </span>
                      ) : null}
                    </div>
                  </Link>
                ))}
              </div>
            </Box>
          ) : null}
          <Box className={styles.reportPanel}>
            <PanelTitle>작전 본문</PanelTitle>
            <div
              className={styles.reportBody}
              dangerouslySetInnerHTML={{ __html: summaryHtml }}
            />
          </Box>

          {report.highlights.length > 0 ? (
            <Box className={styles.reportPanel}>
              <PanelTitle
                right={
                  <span className={styles.mono}>
                    {report.highlights.length}
                  </span>
                }
              >
                전개 기록
              </PanelTitle>
              <ul className={styles.list}>
                {report.highlights.map((h, i) => (
                  <li key={i} className={styles.list__item}>
                    <Eyebrow tone="gold" className={styles.list__num}>
                      {String(i + 1).padStart(2, "0")}
                    </Eyebrow>
                    <span className={styles.list__text}>{h}</span>
                  </li>
                ))}
              </ul>
            </Box>
          ) : null}
        </div>
      </div>
    </>
  );
}
