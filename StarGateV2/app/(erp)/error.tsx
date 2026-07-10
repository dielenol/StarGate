"use client";

import styles from "./error-state.module.css";

export default function ERPError({ reset }: { reset: () => void }) {
  return (
    <div className={styles.state}>
      <section className={styles.state__panel} role="alert">
        <span className={styles.state__code}>ERP / RECOVERY REQUIRED</span>
        <h1 className={styles.state__title}>데이터를 불러오지 못했습니다</h1>
        <p className={styles.state__description}>
          일시적인 통신 또는 데이터베이스 오류일 수 있습니다. 다시 시도해도
          계속되면 운영자에게 문의해주세요.
        </p>
        <div className={styles.state__actions}>
          <button className={styles.state__button} onClick={reset} type="button">
            다시 시도
          </button>
        </div>
      </section>
    </div>
  );
}
