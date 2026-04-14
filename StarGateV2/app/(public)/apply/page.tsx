"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { submitApplyForm } from "@/lib/form-submit";
import { validateApplyForm } from "@/lib/validators";
import styles from "../forms.module.css";
import frameStyles from "../page.module.css";

export default function ApplyPage() {
  const router = useRouter();
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
            <h1 className={styles["form-page__title"]}>입회 심사 신청</h1>
            <p className={styles["form-page__description"]}>
              아래 기록지는 노부스 오르도 입회 심사를 위한 1차 서류입니다. <br />
              소개란에는 활동 가능 시간, 성향, 참여 목적 등을 자유롭게 기입해 주세요.
              <br />
              <span className={styles["form-page__description-emphasis"]}>
                제출된 기록은 검토 후 등록된 연락처로 회신됩니다.
              </span>
            </p>

            <form className={styles["form-page__form"]} onSubmit={onSubmit}>
              <label className={styles["form-page__label"]}>
                이름
                <input
                  className={styles["form-page__input"]}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="신원 식별명을 입력하세요."
                />
              </label>

              <label className={styles["form-page__label"]}>
                이메일
                <input
                  className={styles["form-page__input"]}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="회신 가능한 채널(example@email.com)을 입력하세요."
                />
              </label>

              <label className={styles["form-page__label"]}>
                소개 기록
                <textarea
                  className={styles["form-page__textarea"]}
                  value={motivation}
                  onChange={(e) => setMotivation(e.target.value)}
                  placeholder="활동 가능 시간, 성향, 참여 목적 등을 자유롭게 기록하세요. (미작성도 무관합니다)"
                />
              </label>

              <div className={styles["form-page__actions"]}>
                <button className={styles["form-page__button"]} disabled={loading} type="submit">
                  {loading ? "기록 전송 중..." : "심사 기록 제출"}
                </button>
                {error ? (
                  <span
                    className={`${styles["form-page__message"]} ${styles["form-page__message--error"]}`}
                  >
                    {error}
                  </span>
                ) : null}
              </div>
            </form>

            <div className={frameStyles["stargate__cta-row"]}>
              <Link className={frameStyles["stargate__cta-link"]} href="/">
                <div className={frameStyles["stargate__cta-outer"]}>
                  <div className={frameStyles["stargate__cta-inner"]}>
                    <div className={frameStyles["stargate__cta-icon"]}>↩</div>
                    <div className={frameStyles["stargate__cta-title"]}>기밀 아카이브로 복귀</div>
                    <div className={frameStyles["stargate__cta-subtitle"]}>RETURN TO ARCHIVE</div>
                  </div>
                </div>
              </Link>
            </div>

            {success ? (
              <div className={styles["form-page__success-overlay"]} role="dialog" aria-modal="true">
                <div className={styles["form-page__success-panel"]}>
                  <div className={styles["form-page__success-badge"]}>TRANSMISSION COMPLETE</div>
                  <h2 className={styles["form-page__success-title"]}>입회 심사 기록이 정상 접수되었습니다.</h2>
                  <p className={styles["form-page__success-description"]}>{success}</p>

                  <button className={styles["form-page__success-cta"]} onClick={() => router.push("/")} type="button">
                    <span className={styles["form-page__success-cta-icon"]}>↩</span>
                    <span className={styles["form-page__success-cta-title"]}>기밀 아카이브로 이동</span>
                    <span className={styles["form-page__success-cta-subtitle"]}>RETURN TO ARCHIVE</span>
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}
