import styles from "./closed-state.module.css";

interface Props {
  /** 표시 날짜 문구. 기본값은 공식 마감 시각. */
  date?: string;
}

/** 모집 마감 · RECRUITMENT · CLOSED 회전 인장 */
export default function ClosedStamp({
  date = "2026 · 04 · 24 · 23:59 KST",
}: Props) {
  return (
    <div className={styles.stampWrap} aria-hidden>
      <div className={styles.stamp}>
        <div className={styles.stampInner}>
          <div className={styles.stampKr}>모집 마감</div>
          <div className={styles.stampEn}>RECRUITMENT · CLOSED</div>
          <div className={styles.stampDate}>{date}</div>
        </div>
      </div>
    </div>
  );
}
