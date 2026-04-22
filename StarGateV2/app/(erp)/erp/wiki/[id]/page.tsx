import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import { isValidObjectId } from "@/lib/db/utils";
import { findWikiPageById, listWikiPages } from "@/lib/db/wiki";
import { renderMarkdown } from "@/lib/wiki-render";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import PageHead from "@/components/ui/PageHead/PageHead";
import Tag from "@/components/ui/Tag/Tag";

import WikiDeleteButton from "./WikiDeleteButton";
import WikiDetailContent from "./WikiDetailContent";

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

function fmtDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
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
  const contentHtml = renderMarkdown(page.content);
  const toc = extractToc(page.content);

  // 카테고리 네비를 위해 전체 페이지 목록 로드 (실패 시 빈 목록)
  const allPages = await listWikiPages().catch(() => []);
  const categories = [...new Set(allPages.map((p) => p.category))].sort();

  return (
    <>
      <PageHead
        breadcrumb={`ERP / CODEX / ${page.category.toUpperCase()}`}
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
          <Box>
            <div className={styles.header}>
              <div className={styles.header__meta}>
                <Tag tone="gold">{page.category}</Tag>
                {page.tags.map((tag) => (
                  <Tag key={tag}>{tag}</Tag>
                ))}
              </div>
              <h2 className={styles.header__title}>{page.title}</h2>
              <div className={styles.header__info}>
                최종 수정 {fmtDate(page.updatedAt)} · @{page.authorName}
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
                  <dd>{fmtDate(page.createdAt)}</dd>
                </div>
                <div className={styles.footerMeta__row}>
                  <dt>수정일</dt>
                  <dd>{fmtDate(page.updatedAt)}</dd>
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

        {/* ── Right: TOC + placeholders ── */}
        <Box className={`${styles.aside} ${styles.layout__aside}`}>
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

          {/* BACKLINKS / HISTORY 는 현재 데이터 모델에서 조회 지원 없음 — 차후 기능 */}
          <div className={styles.aside__section}>
            <Eyebrow>BACKLINKS</Eyebrow>
            <span className={styles.aside__empty}>—</span>
          </div>

          <div className={styles.aside__section}>
            <Eyebrow>HISTORY</Eyebrow>
            <span className={styles.aside__empty}>—</span>
          </div>
        </Box>
      </div>
    </>
  );
}
