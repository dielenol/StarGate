import Link from "next/link";
import { redirect, notFound } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import { findReportById } from "@/lib/db/session-reports";
import { isValidObjectId } from "@/lib/db/utils";
import { listWikiPages } from "@/lib/db/wiki";
import { formatDate } from "@/lib/format/date";
import {
  formatOperationReportTitle,
  formatShortReporterName,
} from "@/lib/format/session-report";
import { renderMarkdown } from "@/lib/wiki-render";
import type { WikiPage } from "@stargate/shared-db/types";

import { IconReportDocument } from "@/components/icons";
import Box from "@/components/ui/Box/Box";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import PageHead from "@/components/ui/PageHead/PageHead";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";
import Stack from "@/components/ui/Stack/Stack";
import Tag from "@/components/ui/Tag/Tag";

import ReportActions from "./ReportActions";

import styles from "./page.module.css";

interface Props {
  params: Promise<{ id: string }>;
}

interface RelatedWikiLink {
  id: string;
  title: string;
  category: string;
}

const WIKI_CATEGORY_ORDER = [
  "작전 보고서",
  "개체",
  "개념",
  "세력",
  "기관",
  "장소",
  "인물",
  "규정",
  "장비",
  "소모품",
  "문헌",
];

function extractSessionKeys(sessionId: string, title: string): string[] {
  const keys = new Set<string>();
  const source = `${sessionId} ${title}`;
  const matches = source.match(/S\d+E\d+/giu) ?? [];

  for (const match of matches) {
    keys.add(match.toUpperCase());
  }

  return [...keys];
}

function pageMatchesReport(
  page: WikiPage,
  sessionKeys: string[],
  displayTitle: string
): boolean {
  if (page.title === displayTitle) return true;
  if (sessionKeys.length === 0) return false;

  const tags = page.tags.map((tag) => tag.toUpperCase());
  const title = page.title.toUpperCase();
  const content = page.content.toUpperCase();

  return sessionKeys.some(
    (key) =>
      tags.includes(key) ||
      title.includes(key) ||
      content.includes(`관련 세션: ${key}`.toUpperCase())
  );
}

function toRelatedWikiLink(page: WikiPage): RelatedWikiLink | null {
  const id = page._id?.toString();
  if (!id) return null;

  return {
    id,
    title: page.title,
    category: page.category,
  };
}

function sortRelatedWikiLinks(
  left: RelatedWikiLink,
  right: RelatedWikiLink
): number {
  const leftCategory = WIKI_CATEGORY_ORDER.indexOf(left.category);
  const rightCategory = WIKI_CATEGORY_ORDER.indexOf(right.category);
  const leftRank =
    leftCategory === -1 ? WIKI_CATEGORY_ORDER.length : leftCategory;
  const rightRank =
    rightCategory === -1 ? WIKI_CATEGORY_ORDER.length : rightCategory;

  if (leftRank !== rightRank) return leftRank - rightRank;
  return left.title.localeCompare(right.title, "ko");
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
  const dossierLead = report.locationLabel
    ? `${mapLocationLabel}에서 기록된 세션 작전 보고서. 본문은 원본 로그를 작전 개요, 시간대별 전개, 교전·격리 결과, 후속 문서로 재구성한다.`
    : "작전지 좌표가 아직 등록되지 않은 세션 작전 보고서. 본문은 원본 로그를 작전 개요, 시간대별 전개, 교전·격리 결과, 후속 문서로 재구성한다.";
  const sessionKeys = extractSessionKeys(report.sessionId, displayTitle);
  const relatedWikiLinks = (await listWikiPages().catch(() => []))
    .filter((page) => pageMatchesReport(page, sessionKeys, displayTitle))
    .map(toRelatedWikiLink)
    .filter((page): page is RelatedWikiLink => page !== null)
    .sort(sortRelatedWikiLinks);

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
          <Eyebrow tone="gold">OPERATION DOSSIER</Eyebrow>
          <h2 className={styles.dossierHero__title}>{displayTitle}</h2>
          <p className={styles.dossierHero__lead}>{dossierLead}</p>
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
            <PanelTitle>METADATA</PanelTitle>
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
                RELATED WIKI
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

          {report.participants.length > 0 ? (
            <Box className={styles.reportPanel}>
              <PanelTitle
                right={
                  <span className={styles.mono}>
                    {report.participants.length}
                  </span>
                }
              >
                PARTICIPANTS
              </PanelTitle>
              <Stack gap={6}>
                {report.participants.map((p, i) => (
                  <Tag key={i} tone="success">
                    {p}
                  </Tag>
                ))}
              </Stack>
            </Box>
          ) : null}
        </div>

        <div className={styles.main}>
          <Box className={styles.reportPanel}>
            <PanelTitle>REPORT DOSSIER</PanelTitle>
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
                TACTICAL SEQUENCE
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
