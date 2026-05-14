"use client";

import styles from "./NavPendingOverlay.module.css";

export default function NavPendingOverlay({ pending }: { pending: boolean }) {
  return (
    <div
      className={[
        styles.overlay,
        pending ? styles["overlay--pending"] : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-hidden={!pending}
    >
      <div className={styles.overlay__spinner} />
      <span className={styles.overlay__text}>LOADING...</span>
    </div>
  );
}
