"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { useUpdateWiki } from "@/hooks/mutations/useWikiMutation";
import { StaleVersionApiError } from "@/hooks/mutations/StaleVersionApiError";
import { useWikiPage } from "@/hooks/queries/useWikiQuery";
import type { WikiPageClient } from "@/types/wiki";

import { renderMarkdown } from "@/lib/wiki-render";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import Input from "@/components/ui/Input/Input";
import PageHead from "@/components/ui/PageHead/PageHead";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";

import styles from "./WikiEditForm.module.css";

interface WikiEditFormProps {
  initialPage: WikiPageClient;
}

export default function WikiEditForm({
  initialPage,
}: WikiEditFormProps) {
  const pageId = initialPage._id;
  const router = useRouter();
  const updateWiki = useUpdateWiki();
  const pageQuery = useWikiPage(pageId, { initialData: initialPage });

  const [title, setTitle] = useState(initialPage.title);
  const [category, setCategory] = useState(initialPage.category);
  const [tagsInput, setTagsInput] = useState(initialPage.tags.join(", "));
  const [content, setContent] = useState(initialPage.content);
  const [isPublic, setIsPublic] = useState(initialPage.isPublic);
  const [baselineUpdatedAt, setBaselineUpdatedAt] = useState<string | null>(
    initialPage.updatedAt || null,
  );
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestPage = pageQuery.data ?? initialPage;
  const latestUpdatedAt = latestPage.updatedAt || null;
  const externalChange =
    dirty && latestUpdatedAt !== baselineUpdatedAt;

  if (!dirty && latestUpdatedAt !== baselineUpdatedAt) {
    setTitle(latestPage.title);
    setCategory(latestPage.category);
    setTagsInput(latestPage.tags.join(", "));
    setContent(latestPage.content);
    setIsPublic(latestPage.isPublic);
    setBaselineUpdatedAt(latestUpdatedAt);
  }

  function reloadLatestPage() {
    setTitle(latestPage.title);
    setCategory(latestPage.category);
    setTagsInput(latestPage.tags.join(", "));
    setContent(latestPage.content);
    setIsPublic(latestPage.isPublic);
    setBaselineUpdatedAt(latestUpdatedAt);
    setDirty(false);
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    updateWiki.mutate(
      {
        id: pageId,
        data: { title, category, tags, content, isPublic },
        expectedUpdatedAt: baselineUpdatedAt,
      },
      {
        onSuccess: () => {
          router.push(`/erp/wiki/${pageId}`);
        },
        onError: (err) => {
          setError(err.message);
          if (err instanceof StaleVersionApiError) {
            void pageQuery.refetch();
          }
        },
      },
    );
  }

  const previewHtml = renderMarkdown(content);

  return (
    <>
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "CODEX", href: "/erp/wiki" },
          { label: category.toUpperCase(), href: `/erp/wiki/${pageId}` },
          { label: "EDIT" },
        ]}
        title="문서 수정"
        right={
          <Button as="a" href={`/erp/wiki/${pageId}`}>
            취소
          </Button>
        }
      />

      <form className={styles.form} onSubmit={handleSubmit}>
        <Box>
          <PanelTitle>DOCUMENT METADATA</PanelTitle>
          <div className={styles.grid}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="wiki-title">
                TITLE
              </label>
              <Input
                id="wiki-title"
                onChange={(e) => {
                  setDirty(true);
                  setTitle(e.target.value);
                }}
                placeholder="문서 제목"
                required
                type="text"
                value={title}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="wiki-category">
                CATEGORY
              </label>
              <Input
                id="wiki-category"
                onChange={(e) => {
                  setDirty(true);
                  setCategory(e.target.value);
                }}
                placeholder="카테고리"
                type="text"
                value={category}
              />
            </div>
            <div className={`${styles.field} ${styles["field--full"]}`}>
              <label className={styles.label} htmlFor="wiki-tags">
                TAGS
              </label>
              <Input
                id="wiki-tags"
                onChange={(e) => {
                  setDirty(true);
                  setTagsInput(e.target.value);
                }}
                placeholder="태그1, 태그2, 태그3 (콤마 구분)"
                type="text"
                value={tagsInput}
              />
            </div>
            <div className={`${styles.field} ${styles["field--full"]}`}>
              <label className={styles.checkbox}>
                <input
                  checked={isPublic}
                  className={styles.checkbox__input}
                  onChange={(e) => {
                    setDirty(true);
                    setIsPublic(e.target.checked);
                  }}
                  type="checkbox"
                />
                <span>공개 문서</span>
              </label>
            </div>
          </div>
        </Box>

        <Box>
          <PanelTitle>CONTENT · PREVIEW</PanelTitle>
          <div className={styles.editor}>
            <div className={styles.editorPane}>
              <span className={styles.label}>MARKDOWN</span>
              <textarea
                className={styles.textarea}
                onChange={(e) => {
                  setDirty(true);
                  setContent(e.target.value);
                }}
                placeholder="마크다운으로 작성하세요..."
                rows={24}
                value={content}
              />
            </div>
            <div className={styles.editorPane}>
              <span className={styles.label}>PREVIEW</span>
              {content.trim() ? (
                <div
                  className={styles.preview}
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              ) : (
                <div className={styles.preview}>
                  <span className={styles.previewEmpty}>
                    미리보기가 여기에 표시됩니다.
                  </span>
                </div>
              )}
            </div>
          </div>
        </Box>

        {externalChange ? (
          <div className={styles.staleNotice} role="alert">
            <div>
              <strong>다른 사용자가 이 문서를 수정했습니다.</strong>
              <span>
                작성 중인 내용은 보존했습니다. 최신본을 불러오기 전에는
                저장할 수 없습니다.
              </span>
            </div>
            <Button type="button" onClick={reloadLatestPage}>
              최신본 불러오기
            </Button>
          </div>
        ) : null}

        {error ? (
          <div className={styles.error} role="alert">
            {error}
          </div>
        ) : null}

        <div className={styles.actions}>
          <Button
            type="submit"
            variant="primary"
            disabled={updateWiki.isPending || externalChange}
          >
            {updateWiki.isPending ? "저장 중..." : "저장"}
          </Button>
          <Button as="a" href={`/erp/wiki/${pageId}`}>
            취소
          </Button>
        </div>
      </form>
    </>
  );
}
