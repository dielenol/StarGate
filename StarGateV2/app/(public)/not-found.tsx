import Link from "next/link";

import styles from "./error-state.module.css";

export default function PublicNotFound() {
  return (
    <main className={styles.state}>
      <section className={styles.state__panel}>
        <span className={styles.state__code}>ARCHIVE RECORD 404</span>
        <h1 className={styles.state__title}>기록을 찾을 수 없습니다</h1>
        <p className={styles.state__description}>
          주소가 변경되었거나 공개되지 않은 기록입니다.
        </p>
        <div className={styles.state__actions}>
          <Link className={styles.state__button} href="/">
            기밀 아카이브
          </Link>
        </div>
      </section>
    </main>
  );
}
