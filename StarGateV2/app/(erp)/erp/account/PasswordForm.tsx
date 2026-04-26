"use client";

import { useState } from "react";

import styles from "./PasswordForm.module.css";

const MIN_PASSWORD_LENGTH = 8;

// TODO(P5): API 경로(`/api/erp/profile/password`) 를 `/api/erp/account/password` 로 이관.
// 현재는 호환성 유지 차원에서 그대로 둠 — account 라우트 이관과 함께 일괄 정리 예정.
export default function PasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`새 비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("새 비밀번호와 확인이 일치하지 않습니다.");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch("/api/erp/profile/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "비밀번호 변경에 실패했습니다.");
        return;
      }

      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.pw__form} onSubmit={handleSubmit}>
      <label className={styles.pw__field}>
        <span className={styles.pw__label}>CURRENT PASSWORD</span>
        <input
          className={styles.pw__input}
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder="현재 비밀번호"
          required
          autoComplete="current-password"
        />
      </label>

      <label className={styles.pw__field}>
        <span className={styles.pw__label}>NEW PASSWORD</span>
        <input
          className={styles.pw__input}
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder={`${MIN_PASSWORD_LENGTH}자 이상`}
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
        />
        <span className={styles.pw__hint}>
          최소 {MIN_PASSWORD_LENGTH}자 · 영문/숫자/기호 혼합 권장
        </span>
      </label>

      <label className={styles.pw__field}>
        <span className={styles.pw__label}>CONFIRM NEW PASSWORD</span>
        <input
          className={styles.pw__input}
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="새 비밀번호 확인"
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
        />
      </label>

      {error ? (
        <div className={styles.pw__error} role="alert">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className={styles.pw__success} role="status">
          비밀번호가 성공적으로 변경되었습니다.
        </div>
      ) : null}

      <div className={styles.pw__submit}>
        <span className={styles.pw__submit__notice}>
          변경 시 모든 세션 로그아웃
        </span>
        <button
          type="submit"
          className={styles.pw__btn}
          disabled={submitting}
          aria-busy={submitting}
        >
          {submitting ? "변경 중" : "비밀번호 변경"}
        </button>
      </div>
    </form>
  );
}
