import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import {
  listWikiPages,
  listWikiPagesByCategory,
  searchWikiPages,
} from "@/lib/db/wiki";

import WikiSearchBar from "./WikiSearchBar";
import styles from "./page.module.css";

interface WikiListPageProps {
  searchParams: Promise<{ category?: string; q?: string }>;
}

export default async function WikiListPage({
  searchParams,
}: WikiListPageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { category, q } = await searchParams;
  const isGM = hasRole(session.user.role, "GM");

  let pages: Awaited<ReturnType<typeof listWikiPages>> = [];
  try {
    if (q) {
      pages = await searchWikiPages(q);
    } else if (category) {
      pages = await listWikiPagesByCategory(category);
    } else {
      pages = await listWikiPages();
    }
  } catch {
    pages = [];
  }

  // 카테고리 목록 추출 (전체 문서에서)
  const allPages = q || category ? await listWikiPages().catch(() => []) : pages;
  const categories = [...new Set(allPages.map((p) => p.category))].sort();

  return (
    <section className={styles.wiki}>
      <div className={styles.wiki__header}>
        <div className={styles.wiki__headerLeft}>
          <div className={styles.wiki__classification}>WORLD DATABASE</div>
          <h1 className={styles.wiki__title}>월드빌딩 위키</h1>
        </div>
        {isGM && (
          <Link className={styles.wiki__newBtn} href="/erp/wiki/new">
            + 새 문서 작성
          </Link>
        )}
      </div>

      <WikiSearchBar />

      {categories.length > 0 && (
        <div className={styles.wiki__categories}>
          <Link
            className={`${styles.wiki__categoryBtn} ${!category && !q ? styles["wiki__categoryBtn--active"] : ""}`}
            href="/erp/wiki"
          >
            전체
          </Link>
          {categories.map((cat) => (
            <Link
              className={`${styles.wiki__categoryBtn} ${category === cat ? styles["wiki__categoryBtn--active"] : ""}`}
              href={`/erp/wiki?category=${encodeURIComponent(cat)}`}
              key={cat}
            >
              {cat}
            </Link>
          ))}
        </div>
      )}

      {pages.length === 0 ? (
        <p className={styles.wiki__empty}>
          {q ? `"${q}"에 대한 검색 결과가 없습니다.` : "등록된 문서가 없습니다."}
        </p>
      ) : (
        <div className={styles.wiki__list}>
          {pages.map((page) => (
            <Link
              className={styles.wiki__item}
              href={`/erp/wiki/${page._id!.toString()}`}
              key={page._id!.toString()}
            >
              <span className={styles.wiki__itemTitle}>{page.title}</span>
              <div className={styles.wiki__itemMeta}>
                <span className={styles.wiki__badge}>{page.category}</span>
                {page.tags.slice(0, 3).map((tag) => (
                  <span className={styles.wiki__tag} key={tag}>
                    {tag}
                  </span>
                ))}
                {!page.isPublic && (
                  <span className={styles.wiki__private}>PRIVATE</span>
                )}
                <span className={styles.wiki__date}>
                  {new Date(page.updatedAt).toLocaleDateString("ko-KR")}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
