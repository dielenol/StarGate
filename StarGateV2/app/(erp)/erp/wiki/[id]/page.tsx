import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import { listCharacters } from "@/lib/db/characters";
import { listSessionReports } from "@/lib/db/session-reports";
import { isValidObjectId } from "@/lib/db/utils";
import { findWikiPageById, listWikiPages } from "@/lib/db/wiki";
import { formatDate } from "@/lib/format/date";
import {
  relatedPersonnelForReports,
  relatedReportsForWiki,
} from "@/lib/lore-links";
import { renderMarkdown } from "@/lib/wiki-render";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import PageHead from "@/components/ui/PageHead/PageHead";
import Tag from "@/components/ui/Tag/Tag";

import WikiDeleteButton from "./WikiDeleteButton";
import WikiDetailContent from "./WikiDetailContent";
import {
  wikiArticleContent,
  wikiCategoryTone,
  wikiFirstImage,
  wikiInfoRows,
  wikiKeywordTags,
  wikiLead,
  wikiRelatedLinks,
  wikiSourceLines,
} from "../wiki-display";

import styles from "./page.module.css";

interface WikiDetailPageProps {
  params: Promise<{ id: string }>;
}

interface TocEntry {
  id: string;
  level: 2 | 3 | 4;
  text: string;
}

/**
 * 마크다운 본문에서 heading (#, ##, ###) 을 뽑아 TOC 엔트리로 변환.
 *
 * `lib/wiki-render.ts` 와 동일한 파싱 규칙:
 *   `#` → h2, `##` → h3, `###` → h4.
 * 본문이 `dangerouslySetInnerHTML` 로 렌더되므로 서버에서 id 슬러그를 발급해
 * 클라이언트 컴포넌트가 동일 순서로 주입할 수 있게 한다.
 */
function extractToc(content: string): TocEntry[] {
  if (!content) return [];
  const entries: TocEntry[] = [];
  const lines = content.split("\n");
  let counter = 0;
  for (const line of lines) {
    const match = line.match(/^(#{1,3})\s+(.+)$/);
    if (!match) continue;
    const level = (match[1].length + 1) as 2 | 3 | 4;
    const text = match[2]
      // 인라인 마크다운 제거 (볼드/이탤릭)
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .trim();
    entries.push({ id: `wiki-h-${counter}`, level, text });
    counter += 1;
  }
  return entries;
}

export default async function WikiDetailPage({
  params,
}: WikiDetailPageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;
  if (!isValidObjectId(id)) notFound();

  const page = await findWikiPageById(id);
  if (!page) {
    notFound();
  }

  const isGM = hasRole(session.user.role, "V");
  const isAdmin = hasRole(session.user.role, "GM");
  const pageId = page._id!.toString();

  // 카테고리 네비를 위해 전체 페이지 목록 로드 (실패 시 빈 목록)
  const allPages = await listWikiPages().catch(() => []);
  const categories = [...new Set(allPages.map((p) => p.category))].sort();
  const articleContent = wikiArticleContent(page.content, page.title);
  const contentHtml = renderMarkdown(articleContent);
  const toc = extractToc(articleContent);
  const keywordTags = wikiKeywordTags(page, 4);
  const lead = wikiLead(page.content);
  const infoboxImage = wikiFirstImage(page.content);
  const infoRows = wikiInfoRows(page);
  const relatedLinks = wikiRelatedLinks(page, allPages);
  const sourceLines = wikiSourceLines(page.content);
  const allReports = await listSessionReports().catch(() => []);
  const allCharacters = await listCharacters().catch(() => []);
  const visibleCharacters = isAdmin
    ? allCharacters
    : allCharacters.filter((character) => character.isPublic !== false);
  const relatedReports = relatedReportsForWiki(page, allReports);
  const relatedPersonnel = relatedPersonnelForReports(
    relatedReports,
    visibleCharacters,
  );

  return (
    <>
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "CODEX", href: "/erp/wiki" },
          { label: page.category.toUpperCase() },
        ]}
        title={page.title}
        right={
          <>
            <Tag tone={page.isPublic ? "success" : "danger"}>
              {page.isPublic ? "PUBLIC" : "PRIVATE"}
            </Tag>
            {isGM ? (
              <Button
                as="a"
                href={`/erp/wiki/${pageId}/edit`}
                variant="primary"
              >
                편집
              </Button>
            ) : null}
            {isAdmin ? <WikiDeleteButton pageId={pageId} /> : null}
          </>
        }
      />

      <div className={styles.layout}>
        {/* ── Left: category nav ── */}
        <Box className={styles.nav}>
          <Eyebrow>CATEGORIES</Eyebrow>
          <ul className={styles.nav__list}>
            <li>
              <Link href="/erp/wiki" className={styles.nav__item}>
                <span>전체</span>
              </Link>
            </li>
            {categories.map((cat) => {
              const active = cat === page.category;
              return (
                <li key={cat}>
                  <Link
                    href={`/erp/wiki?category=${encodeURIComponent(cat)}`}
                    className={[
                      styles.nav__item,
                      active ? styles["nav__item--active"] : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    aria-current={active ? "page" : undefined}
                  >
                    <span>{cat}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Box>

        {/* ── Center: article body ── */}
        <div className={styles.body}>
          <Box className={styles.article}>
            <div className={styles.header}>
              <div className={styles.header__meta}>
                <Tag tone={wikiCategoryTone(page.category)}>
                  {page.category}
                </Tag>
                {keywordTags.map((tag) => (
                  <Tag key={tag}>{tag}</Tag>
                ))}
              </div>
              <h2 className={styles.header__title}>{page.title}</h2>
              {lead ? <p className={styles.header__lead}>{lead}</p> : null}
              <div className={styles.header__info}>
                {page.authorName} · 최종 수정 {formatDate(page.updatedAt, "long")}
              </div>
            </div>

            <WikiDetailContent html={contentHtml} toc={toc} />

            <div className={styles.footer}>
              <dl className={styles.footerMeta}>
                <div className={styles.footerMeta__row}>
                  <dt>작성자</dt>
                  <dd>{page.authorName}</dd>
                </div>
                <div className={styles.footerMeta__row}>
                  <dt>작성일</dt>
                  <dd>{formatDate(page.createdAt, "long")}</dd>
                </div>
                <div className={styles.footerMeta__row}>
                  <dt>수정일</dt>
                  <dd>{formatDate(page.updatedAt, "long")}</dd>
                </div>
              </dl>

              <div className={styles.actions}>
                <Link href="/erp/wiki" className={styles.back}>
                  ← 위키 목록
                </Link>
              </div>
            </div>
          </Box>
        </div>

        {/* ── Right: infobox + TOC + related docs ── */}
        <Box className={`${styles.aside} ${styles.layout__aside}`}>
          <div className={styles.infobox}>
            <div className={styles.infobox__head}>
              <Eyebrow tone="gold">INFOBOX</Eyebrow>
              <Tag tone={page.isPublic ? "success" : "danger"}>
                {page.isPublic ? "PUBLIC" : "PRIVATE"}
              </Tag>
            </div>

            {infoboxImage ? (
              <figure className={styles.infobox__figure}>
                <div className={styles.infobox__imageFrame}>
                  <Image
                    src={infoboxImage.src}
                    alt={infoboxImage.alt}
                    fill
                    sizes="(max-width: 900px) 100vw, 300px"
                  />
                </div>
                {infoboxImage.caption ? (
                  <figcaption>{infoboxImage.caption}</figcaption>
                ) : null}
              </figure>
            ) : null}

            <dl className={styles.infobox__list}>
              {infoRows.map((row) => (
                <div key={row.label} className={styles.infobox__row}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className={styles.aside__section}>
            <Eyebrow>CONTENTS</Eyebrow>
            {toc.length === 0 ? (
              <span className={styles.aside__empty}>목차 없음</span>
            ) : (
              <ul className={styles.aside__list}>
                {toc.map((entry) => (
                  <li key={entry.id}>
                    <a
                      href={`#${entry.id}`}
                      className={[
                        styles.toc__link,
                        entry.level === 3 ? styles["toc__link--l3"] : "",
                        entry.level === 4 ? styles["toc__link--l4"] : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {entry.text}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {relatedLinks.length > 0 ? (
            <div className={styles.aside__section}>
              <Eyebrow>RELATED</Eyebrow>
              <nav className={styles.related} aria-label="관련 위키 문서">
                {relatedLinks.map((link) => (
                  <Link
                    key={link.id}
                    href={`/erp/wiki/${link.id}`}
                    className={styles.related__link}
                  >
                    <span className={styles.related__meta}>
                      {link.category} · {link.relation}
                    </span>
                    <span className={styles.related__title}>
                      {link.title}
                    </span>
                  </Link>
                ))}
              </nav>
            </div>
          ) : null}

          {relatedReports.length > 0 ? (
            <div className={styles.aside__section}>
              <Eyebrow>OPERATION REPORTS</Eyebrow>
              <nav className={styles.related} aria-label="관련 작전 보고서">
                {relatedReports.map((report) => (
                  <Link
                    key={report.id}
                    href={`/erp/sessions/report/${report.id}`}
                    className={styles.related__link}
                  >
                    <span className={styles.related__meta}>
                      {report.sessionId}
                      {report.locationLabel ? ` · ${report.locationLabel}` : ""}
                    </span>
                    <span className={styles.related__title}>
                      {report.title}
                    </span>
                    <span className={styles.related__note}>
                      {formatDate(report.createdAt, "long")}
                    </span>
                  </Link>
                ))}
              </nav>
            </div>
          ) : null}

          {relatedPersonnel.length > 0 ? (
            <div className={styles.aside__section}>
              <Eyebrow>DOSSIER</Eyebrow>
              <nav className={styles.related} aria-label="관련 인물 Dossier">
                {relatedPersonnel.map((character) => (
                  <Link
                    key={character.id}
                    href={`/erp/personnel/${character.id}`}
                    className={styles.related__link}
                  >
                    <span className={styles.related__meta}>
                      {character.type} · {character.agentLevel ?? "U"}
                    </span>
                    <span className={styles.related__title}>
                      {character.name}
                    </span>
                    <span className={styles.related__note}>
                      {character.codename} · {character.role}
                    </span>
                  </Link>
                ))}
              </nav>
            </div>
          ) : null}

          {sourceLines.length > 0 ? (
            <div className={styles.aside__section}>
              <Eyebrow>SOURCES</Eyebrow>
              <ul className={styles.sourceList}>
                {sourceLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className={styles.aside__section}>
            <Eyebrow>RECORD</Eyebrow>
            <dl className={styles.recordList}>
              <div>
                <dt>작성</dt>
                <dd>{formatDate(page.createdAt, "long")}</dd>
              </div>
              <div>
                <dt>수정</dt>
                <dd>{formatDate(page.updatedAt, "long")}</dd>
              </div>
            </dl>
          </div>
        </Box>
      </div>
    </>
  );
}
