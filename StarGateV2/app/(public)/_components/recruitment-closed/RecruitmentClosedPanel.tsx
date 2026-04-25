import Link from "next/link";

import ClosedStamp from "./ClosedStamp";
import DossierMeta, { type DossierRow } from "./DossierMeta";
import FieldRedacted from "./FieldRedacted";
import styles from "./closed-state.module.css";

export interface ClosedField {
  label: string;
  placeholder: string;
  tall?: boolean;
}

interface Props {
  eyebrow: string;
  title: string;
  dossierRows: DossierRow[];
  dossierNote: React.ReactNode;
  fields: ClosedField[];
  submitLabel: string;
}

/**
 * 모집 마감 페이지 공용 껍데기.
 *
 * 기능 완전 비활성 — submit 핸들러 없음, 입력 요소는 `<div>` 기반 프레젠테이션 전용.
 * 웹훅(`lib/form-submit.ts`)은 다른 곳에서 재활용할 수 있도록 그대로 두고,
 * 이 페이지에서는 호출하지 않는다.
 */
export default function RecruitmentClosedPanel({
  eyebrow,
  title,
  dossierRows,
  dossierNote,
  fields,
  submitLabel,
}: Props) {
  return (
    <div className={styles.frame}>
      <div className={styles.panel}>
        <ClosedStamp />

        <header className={styles.head}>
          <div className={styles.eyebrow}>{eyebrow}</div>
          <h1 className={styles.title}>{title}</h1>
          <DossierMeta rows={dossierRows} note={dossierNote} />
        </header>

        <div className={styles.form} aria-disabled>
          {fields.map((f) => (
            <FieldRedacted
              key={f.label}
              label={f.label}
              placeholder={f.placeholder}
              tall={f.tall}
            />
          ))}

          <div className={styles.formFoot}>
            <button
              type="button"
              className={styles.submitDisabled}
              disabled
              aria-disabled
            >
              <span>{submitLabel}</span>
              <span className={styles.submitTag}>DISABLED</span>
            </button>
            <div className={styles.closedTrace}>
              <span className={styles.dot} aria-hidden />
              <span>접수 창구 · 폐쇄됨</span>
              <span className={styles.closedTraceEn}>· CHANNEL CLOSED ·</span>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.returnBox}>
        <Link href="/" className={styles.returnBtn}>
          <div className={styles.returnKr}>← 기밀 아카이브로 복귀</div>
          <div className={styles.returnEn}>RETURN TO ARCHIVE</div>
        </Link>
      </div>
    </div>
  );
}
