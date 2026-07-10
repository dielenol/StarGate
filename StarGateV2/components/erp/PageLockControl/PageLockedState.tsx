import styles from "./PageLockedState.module.css";

interface PageLockedStateProps {
  label: string;
}

export default function PageLockedState({ label }: PageLockedStateProps) {
  return (
    <section className={styles.state} aria-labelledby="erp-page-locked-title">
      <span className={styles.state__eyebrow}>ACCESS TEMPORARILY LOCKED</span>
      <h1 id="erp-page-locked-title">{label} 준비중</h1>
      <p>운영 준비가 완료되면 사이드바 메뉴가 다시 활성화됩니다.</p>
    </section>
  );
}
