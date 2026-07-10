import Link from "next/link";

import styles from "./error-state.module.css";

export default function ERPNotFound() {
  return (
    <div className={styles.state}>
      <section className={styles.state__panel}>
        <span className={styles.state__code}>ERP / RECORD NOT FOUND</span>
        <h1 className={styles.state__title}>기록을 찾을 수 없습니다</h1>
        <p className={styles.state__description}>
          삭제되었거나 현재 권한으로 열람할 수 없는 기록입니다.
        </p>
        <div className={styles.state__actions}>
          <Link className={styles.state__button} href="/erp">
            ERP 대시보드
          </Link>
        </div>
      </section>
    </div>
  );
}
