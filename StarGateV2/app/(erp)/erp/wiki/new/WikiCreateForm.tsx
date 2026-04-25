"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { useCreateWiki } from "@/hooks/mutations/useWikiMutation";

import { renderMarkdown } from "@/lib/wiki-render";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import Input from "@/components/ui/Input/Input";
import PageHead from "@/components/ui/PageHead/PageHead";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";

import styles from "../[id]/edit/WikiEditForm.module.css";

export default function WikiCreateForm() {
  const router = useRouter();
  const createWiki = useCreateWiki();

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [content, setContent] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    createWiki.mutate(
      { title, category, tags, content, isPublic },
      {
        onSuccess: (data) => {
          const newId = data.page?._id;
          router.push(newId ? `/erp/wiki/${newId}` : "/erp/wiki");
        },
        onError: (err) => {
          setError(err.message);
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
          { label: "NEW" },
        ]}
        title="새 문서 작성"
        right={
          <Button as="a" href="/erp/wiki">
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
                onChange={(e) => setTitle(e.target.value)}
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
                onChange={(e) => setCategory(e.target.value)}
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
                onChange={(e) => setTagsInput(e.target.value)}
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
                  onChange={(e) => setIsPublic(e.target.checked)}
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
                onChange={(e) => setContent(e.target.value)}
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

        {error ? (
          <div className={styles.error} role="alert">
            {error}
          </div>
        ) : null}

        <div className={styles.actions}>
          <Button
            type="submit"
            variant="primary"
            disabled={createWiki.isPending}
          >
            {createWiki.isPending ? "저장 중..." : "저장"}
          </Button>
          <Button as="a" href="/erp/wiki">
            취소
          </Button>
        </div>
      </form>
    </>
  );
}
