"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import styles from "./page.module.css";

export default function ReportCreateForm() {
  const router = useRouter();

  const [sessionTitle, setSessionTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [highlights, setHighlights] = useState<string[]>([""]);
  const [participants, setParticipants] = useState<string[]>([""]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddHighlight = () => {
    setHighlights((prev) => [...prev, ""]);
  };

  const handleRemoveHighlight = (index: number) => {
    setHighlights((prev) => prev.filter((_, i) => i !== index));
  };

  const handleHighlightChange = (index: number, value: string) => {
    setHighlights((prev) => prev.map((h, i) => (i === index ? value : h)));
  };

  const handleAddParticipant = () => {
    setParticipants((prev) => [...prev, ""]);
  };

  const handleRemoveParticipant = (index: number) => {
    setParticipants((prev) => prev.filter((_, i) => i !== index));
  };

  const handleParticipantChange = (index: number, value: string) => {
    setParticipants((prev) => prev.map((p, i) => (i === index ? value : p)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const filteredHighlights = highlights.filter((h) => h.trim() !== "");
    const filteredParticipants = participants.filter((p) => p.trim() !== "");

    try {
      const res = await fetch("/api/erp/session-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionTitle: sessionTitle.trim(),
          summary: summary.trim(),
          highlights: filteredHighlights,
          participants: filteredParticipants,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "리포트 생성에 실패했습니다.");
        setSubmitting(false);
        return;
      }

      router.push("/erp/sessions/report");
    } catch {
      setError("네트워크 오류가 발생했습니다.");
      setSubmitting(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {/* Session Title */}
      <label className={styles.form__label}>
        SESSION TITLE
        <input
          className={styles.form__input}
          type="text"
          value={sessionTitle}
          onChange={(e) => setSessionTitle(e.target.value)}
          placeholder="세션 제목"
          required
        />
      </label>

      {/* Summary */}
      <label className={styles.form__label}>
        SUMMARY
        <textarea
          className={styles.form__textarea}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="세션 요약을 작성하세요..."
          rows={6}
          required
        />
      </label>

      {/* Highlights */}
      <fieldset className={styles.form__fieldset}>
        <legend className={styles.form__legend}>HIGHLIGHTS</legend>
        {highlights.map((h, i) => (
          <div key={i} className={styles.form__dynamicRow}>
            <input
              className={styles.form__input}
              type="text"
              value={h}
              onChange={(e) => handleHighlightChange(i, e.target.value)}
              placeholder={`하이라이트 ${i + 1}`}
            />
            {highlights.length > 1 && (
              <button
                type="button"
                className={styles.form__removeBtn}
                onClick={() => handleRemoveHighlight(i)}
                aria-label={`하이라이트 ${i + 1} 삭제`}
              >
                &times;
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          className={styles.form__addBtn}
          onClick={handleAddHighlight}
        >
          + 하이라이트 추가
        </button>
      </fieldset>

      {/* Participants */}
      <fieldset className={styles.form__fieldset}>
        <legend className={styles.form__legend}>PARTICIPANTS</legend>
        {participants.map((p, i) => (
          <div key={i} className={styles.form__dynamicRow}>
            <input
              className={styles.form__input}
              type="text"
              value={p}
              onChange={(e) => handleParticipantChange(i, e.target.value)}
              placeholder={`참여자 ${i + 1}`}
            />
            {participants.length > 1 && (
              <button
                type="button"
                className={styles.form__removeBtn}
                onClick={() => handleRemoveParticipant(i)}
                aria-label={`참여자 ${i + 1} 삭제`}
              >
                &times;
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          className={styles.form__addBtn}
          onClick={handleAddParticipant}
        >
          + 참여자 추가
        </button>
      </fieldset>

      {/* Error */}
      {error && (
        <div className={styles.form__error} role="alert">
          {error}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        className={styles.form__submit}
        disabled={submitting}
      >
        {submitting ? "작성 중..." : "리포트 작성"}
      </button>
    </form>
  );
}
