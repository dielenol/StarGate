"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { submitApplyForm } from "@/lib/form-submit";
import { validateApplyForm } from "@/lib/validators";
import styles from "../forms.module.css";
import frameStyles from "../page.module.css";

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
    <main className={frameStyles["stargate-page"]}>
      <div className={frameStyles.stargate}>
        <div className={frameStyles.stargate__frame}>
          <section className={styles["form-page"]}>
            <h1 className={styles["form-page__title"]}>가입 신청하기</h1>
            <p className={styles["form-page__description"]}>
              아래 양식에 맞춰 자유롭게 작성 후 신청해주세요. <br />
              소개란엔 진행 가능 시간, 성향 등 자유롭게 써주세요. (미작성도 무관합니다.)
              <br />
              <span className={styles["form-page__description-emphasis"]}>
                네이버 게시글에 반드시 댓글도 써주셔야 합니다.
              </span>
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
                소개란
                <textarea
                  className={styles["form-page__textarea"]}
                  value={motivation}
                  onChange={(e) => setMotivation(e.target.value)}
                  placeholder="진행 가능 시간, 성향 등 자유롭게 써주세요 (미작성도 무관합니다.)"
                />
              </label>

              <div className={styles["form-page__actions"]}>
                <button className={styles["form-page__button"]} disabled={loading} type="submit">
                  {loading ? "제출 중..." : "신청서 제출"}
                </button>
                {error ? (
                  <span
                    className={`${styles["form-page__message"]} ${styles["form-page__message--error"]}`}
                  >
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
          </section>
        </div>
      </div>
    </main>
  );
}
