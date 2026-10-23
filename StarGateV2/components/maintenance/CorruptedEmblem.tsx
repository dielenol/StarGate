import styles from "./CorruptedEmblem.module.css";

/**
 * 기관 문장 위에 침입자의 적색 사본이 덮인 상태. 상위 요소의 `--emblem`(마스크 이미지)과
 * `--corruption`(0~1)을 읽어, 복구가 진행될수록 금색 원본이 드러난다.
 */
export default function CorruptedEmblem({ className }: { className?: string }) {
  return (
    <span className={className ? `${styles.emblem} ${className}` : styles.emblem} aria-hidden="true">
      <span className={styles.emblem__base} />
      <span className={styles.emblem__breach} />
      <span className={styles.emblem__ghost} />
    </span>
  );
}
