"use client";

import { useState } from "react";

import styles from "./PasswordForm.module.css";

const MIN_PASSWORD_LENGTH = 8;

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
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.form__fields}>
        <label className={styles.form__label}>
          CURRENT PASSWORD
          <input
            className={styles.form__input}
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="현재 비밀번호"
            required
            autoComplete="current-password"
          />
        </label>

        <label className={styles.form__label}>
          NEW PASSWORD
          <input
            className={styles.form__input}
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder={`${MIN_PASSWORD_LENGTH}자 이상`}
            required
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
          />
        </label>

        <label className={styles.form__label}>
          CONFIRM NEW PASSWORD
          <input
            className={styles.form__input}
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="새 비밀번호 확인"
            required
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
          />
        </label>
      </div>

      <button
        type="submit"
        className={styles.form__submit}
        disabled={submitting}
      >
        {submitting ? "변경 중..." : "비밀번호 변경"}
      </button>

      {error && (
        <div className={styles.form__error} role="alert">
          {error}
        </div>
      )}

      {success && (
        <div className={styles.form__success} role="status">
          비밀번호가 성공적으로 변경되었습니다.
        </div>
      )}
    </form>
  );
}
