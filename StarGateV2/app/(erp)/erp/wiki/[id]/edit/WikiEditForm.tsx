"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { renderMarkdown } from "@/lib/wiki-render";

import styles from "./WikiEditForm.module.css";

interface WikiEditFormProps {
  pageId: string;
  initialTitle: string;
  initialCategory: string;
  initialTags: string[];
  initialContent: string;
  initialIsPublic: boolean;
}

export default function WikiEditForm({
  pageId,
  initialTitle,
  initialCategory,
  initialTags,
  initialContent,
  initialIsPublic,
}: WikiEditFormProps) {
  const router = useRouter();

  const [title, setTitle] = useState(initialTitle);
  const [category, setCategory] = useState(initialCategory);
  const [tagsInput, setTagsInput] = useState(initialTags.join(", "));
  const [content, setContent] = useState(initialContent);
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      const res = await fetch(`/api/erp/wiki/${pageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, category, tags, content, isPublic }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "저장 실패");
        setSubmitting(false);
        return;
      }

      router.push(`/erp/wiki/${pageId}`);
    } catch {
      setError("저장 요청 중 오류가 발생했습니다.");
      setSubmitting(false);
    }
  }

  const previewHtml = renderMarkdown(content);

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <Link className={styles.form__back} href={`/erp/wiki/${pageId}`}>
        &larr; 문서로 돌아가기
      </Link>

      <div className={styles.form__classification}>DOCUMENT EDITOR</div>
      <h1 className={styles.form__title}>문서 수정</h1>

      <div className={styles.form__fields}>
        <div className={styles.form__row}>
          <div className={styles.form__field}>
            <label className={styles.form__label} htmlFor="wiki-title">
              TITLE
            </label>
            <input
              className={styles.form__input}
              id="wiki-title"
              onChange={(e) => setTitle(e.target.value)}
              placeholder="문서 제목"
              required
              type="text"
              value={title}
            />
          </div>
          <div className={styles.form__field}>
            <label className={styles.form__label} htmlFor="wiki-category">
              CATEGORY
            </label>
            <input
              className={styles.form__input}
              id="wiki-category"
              onChange={(e) => setCategory(e.target.value)}
              placeholder="카테고리"
              type="text"
              value={category}
            />
          </div>
        </div>

        <div className={styles.form__field}>
          <label className={styles.form__label} htmlFor="wiki-tags">
            TAGS
          </label>
          <input
            className={styles.form__input}
            id="wiki-tags"
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="태그1, 태그2, 태그3 (콤마 구분)"
            type="text"
            value={tagsInput}
          />
        </div>

        <label className={styles.form__checkbox}>
          <input
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
            type="checkbox"
          />
          공개 문서
        </label>
      </div>

      <div className={styles.form__editor}>
        <div className={styles.form__editorPane}>
          <span className={styles.form__label}>CONTENT</span>
          <textarea
            className={styles.form__textarea}
            onChange={(e) => setContent(e.target.value)}
            placeholder="마크다운으로 작성하세요..."
            rows={24}
            value={content}
          />
        </div>
        <div className={styles.form__editorPane}>
          <span className={styles.form__label}>PREVIEW</span>
          {content.trim() ? (
            <div
              className={styles.form__preview}
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          ) : (
            <div className={styles.form__preview}>
              <span className={styles.form__previewEmpty}>
                미리보기가 여기에 표시됩니다.
              </span>
            </div>
          )}
        </div>
      </div>

      <div className={styles.form__actions}>
        <button
          className={styles.form__submit}
          disabled={submitting}
          type="submit"
        >
          {submitting ? "저장 중..." : "저장"}
        </button>
        <Link className={styles.form__cancel} href={`/erp/wiki/${pageId}`}>
          취소
        </Link>
      </div>

      {error && (
        <div className={styles.form__error} role="alert">
          {error}
        </div>
      )}
    </form>
  );
}
