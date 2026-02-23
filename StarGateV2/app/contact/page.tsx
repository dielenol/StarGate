"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { submitContactForm } from "@/lib/form-submit";
import { validateContactForm } from "@/lib/validators";
import styles from "../forms.module.css";
import frameStyles from "../page.module.css";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    const payload = { name, email, subject, message };

    try {
      validateContactForm(payload);
      setLoading(true);
      const result = await submitContactForm(payload);
      setSuccess(result.message);
      setName("");
      setEmail("");
      setSubject("");
      setMessage("");
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
            <h1 className={styles["form-page__title"]}>질문하기</h1>
            <p className={styles["form-page__description"]}>
              문의사항을 보내주세요. 현재는 1차 구현으로 폼 검증과 제출 플로우만
              동작하며, 메일/DB 연동은 다음 단계에서 연결합니다.
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
                제목
                <input
                  className={styles["form-page__input"]}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="문의 제목을 입력해주세요."
                />
              </label>

              <label className={styles["form-page__label"]}>
                문의 내용
                <textarea
                  className={styles["form-page__textarea"]}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="문의 내용을 입력해주세요."
                />
              </label>

              <div className={styles["form-page__actions"]}>
                <button className={styles["form-page__button"]} disabled={loading} type="submit">
                  {loading ? "전송 중..." : "문의 보내기"}
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
