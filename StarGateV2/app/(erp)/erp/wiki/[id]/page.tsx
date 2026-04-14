import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import { findWikiPageById } from "@/lib/db/wiki";
import { isValidObjectId } from "@/lib/db/utils";
import { renderMarkdown } from "@/lib/wiki-render";

import WikiDeleteButton from "./WikiDeleteButton";
import styles from "./page.module.css";

interface WikiDetailPageProps {
  params: Promise<{ id: string }>;
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

  const isGM = hasRole(session.user.role, "GM");
  const isAdmin = hasRole(session.user.role, "ADMIN");
  const pageId = page._id!.toString();
  const contentHtml = renderMarkdown(page.content);

  return (
    <section className={styles.detail}>
      <Link className={styles.detail__back} href="/erp/wiki">
        &larr; 위키 목록
      </Link>

      <div className={styles.detail__header}>
        <div className={styles.detail__meta}>
          <span className={styles.detail__badge}>{page.category}</span>
          {page.tags.map((tag) => (
            <span className={styles.detail__tag} key={tag}>
              {tag}
            </span>
          ))}
          {!page.isPublic && (
            <span className={styles.detail__private}>PRIVATE</span>
          )}
        </div>
        <h1 className={styles.detail__title}>{page.title}</h1>
      </div>

      <div
        className={styles.detail__content}
        dangerouslySetInnerHTML={{ __html: contentHtml }}
      />

      <div className={styles.detail__footer}>
        <div className={styles.detail__info}>
          <div className={styles.detail__infoRow}>
            <span className={styles.detail__label}>작성자</span>
            <span className={styles.detail__value}>{page.authorName}</span>
          </div>
          <div className={styles.detail__infoRow}>
            <span className={styles.detail__label}>작성일</span>
            <span className={styles.detail__value}>
              {new Date(page.createdAt).toLocaleDateString("ko-KR", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
          </div>
          <div className={styles.detail__infoRow}>
            <span className={styles.detail__label}>수정일</span>
            <span className={styles.detail__value}>
              {new Date(page.updatedAt).toLocaleDateString("ko-KR", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
          </div>
        </div>

        <div className={styles.detail__actions}>
          {isGM && (
            <Link
              className={styles.detail__actionBtn}
              href={`/erp/wiki/${pageId}/edit`}
            >
              수정
            </Link>
          )}
          {isAdmin && <WikiDeleteButton pageId={pageId} />}
        </div>
      </div>
    </section>
  );
}
