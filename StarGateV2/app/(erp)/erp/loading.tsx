import styles from "./loading.module.css";

export default function ERPLoading() {
  return (
    <div className={styles.loading}>
      <div className={styles.loading__spinner} />
      <span className={styles.loading__text}>LOADING...</span>
    </div>
  );
}
