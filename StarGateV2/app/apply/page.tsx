"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { submitApplyForm } from "@/lib/form-submit";
import { validateApplyForm } from "@/lib/validators";
import styles from "../forms.module.css";

export default function ApplyPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [motivation, setMotivation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    const payload = { name, email, motivation };

    try {
      validateApplyForm(payload);
      setLoading(true);
      const result = await submitApplyForm(payload);
      setSuccess(result.message);
      setName("");
      setEmail("");
      setMotivation("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles["form-page"]}>
      <h1 className={styles["form-page__title"]}>가입 신청하기</h1>
      <p className={styles["form-page__description"]}>
        아래 양식을 작성하면 검증 후 임시 접수됩니다. 백엔드 연동 전 단계에서는
        저장/전송 없이 UI 플로우만 동작합니다.
      </p>

      <form className={styles["form-page__form"]} onSubmit={onSubmit}>
        <label className={styles["form-page__label"]}>
          이름
          <input
            className={styles["form-page__input"]}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="홍길동"
          />
        </label>

        <label className={styles["form-page__label"]}>
          이메일
          <input
            className={styles["form-page__input"]}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="example@email.com"
          />
        </label>

        <label className={styles["form-page__label"]}>
          지원 동기
          <textarea
            className={styles["form-page__textarea"]}
            value={motivation}
            onChange={(e) => setMotivation(e.target.value)}
            placeholder="지원 동기를 입력해주세요."
          />
        </label>

        <div className={styles["form-page__actions"]}>
          <button className={styles["form-page__button"]} disabled={loading} type="submit">
            {loading ? "제출 중..." : "신청서 제출"}
          </button>
          {error ? (
            <span className={`${styles["form-page__message"]} ${styles["form-page__message--error"]}`}>
              {error}
            </span>
          ) : null}
          {success ? (
            <span
              className={`${styles["form-page__message"]} ${styles["form-page__message--success"]}`}
            >
              {success}
            </span>
          ) : null}
        </div>
      </form>

      <Link className={styles["form-page__back"]} href="/">
        홈으로 돌아가기
      </Link>
    </main>
  );
}
