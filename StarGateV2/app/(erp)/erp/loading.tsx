import styles from "./loading.module.css";
import RouteLoadingProbe from "@/components/erp/NavPending/RouteLoadingProbe";

export default function ERPLoading() {
  return (
    <div className={styles.loading}>
      <RouteLoadingProbe />
      <div className={styles.loading__spinner} />
      <span className={styles.loading__text}>LOADING...</span>
    </div>
  );
}
