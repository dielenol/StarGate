"use client";

import { useState } from "react";

import Button from "@/components/ui/Button/Button";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import Input from "@/components/ui/Input/Input";

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
      <label className={styles.field}>
        <Eyebrow>CURRENT PASSWORD</Eyebrow>
        <Input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder="현재 비밀번호"
          required
          autoComplete="current-password"
        />
      </label>

      <label className={styles.field}>
        <Eyebrow>NEW PASSWORD</Eyebrow>
        <Input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder={`${MIN_PASSWORD_LENGTH}자 이상`}
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
        />
      </label>

      <label className={styles.field}>
        <Eyebrow>CONFIRM NEW PASSWORD</Eyebrow>
        <Input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="새 비밀번호 확인"
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
        />
      </label>

      <div className={styles.submit}>
        <Button
          type="submit"
          variant="primary"
          disabled={submitting}
        >
          {submitting ? "변경 중..." : "비밀번호 변경"}
        </Button>
      </div>

      {error ? (
        <div className={styles.error} role="alert">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className={styles.success} role="status">
          비밀번호가 성공적으로 변경되었습니다.
        </div>
      ) : null}
    </form>
  );
}
