import styles from "./closed-state.module.css";

interface Props {
  label: string;
  placeholder: string;
  /** 긴 영역(소개/문의 내용용) */
  tall?: boolean;
}

/** 비활성 상태 필드 — 라벨 + VOID 태그 + strike 패턴이 깔린 빈 입력 박스 */
export default function FieldRedacted({ label, placeholder, tall }: Props) {
  return (
    <div className={styles.field}>
      <div className={styles.fieldHead}>
        <span className={styles.fieldLbl}>{label}</span>
        <span className={styles.fieldVoid}>VOID</span>
      </div>
      <div
        className={[styles.input, tall ? styles.inputTall : ""]
          .filter(Boolean)
          .join(" ")}
        aria-disabled
      >
        <span className={styles.inputPh}>{placeholder}</span>
        <div className={styles.inputStrike} aria-hidden />
      </div>
    </div>
  );
}
