"use client";

import styles from "./error-state.module.css";

export default function PublicError({ reset }: { reset: () => void }) {
  return (
    <main className={styles.state}>
      <section className={styles.state__panel} role="alert">
        <span className={styles.state__code}>ARCHIVE SIGNAL LOST</span>
        <h1 className={styles.state__title}>기록 연결이 중단되었습니다</h1>
        <p className={styles.state__description}>
          잠시 후 다시 시도해주세요. 입력한 내용이 있다면 재시도 전에 보존 여부를
          확인해주세요.
        </p>
        <div className={styles.state__actions}>
          <button className={styles.state__button} onClick={reset} type="button">
            다시 연결
          </button>
        </div>
      </section>
    </main>
  );
}
