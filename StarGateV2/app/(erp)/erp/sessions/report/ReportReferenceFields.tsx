"use client";

import type {
  SessionReportReferenceField,
  SessionReportReferenceTextValues,
} from "@/lib/session-report-references";

import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";

import styles from "./new/page.module.css";

interface Props {
  values: SessionReportReferenceTextValues;
  onChange: (field: SessionReportReferenceField, value: string) => void;
}

const FIELDS: Array<{
  field: SessionReportReferenceField;
  label: string;
  placeholder: string;
}> = [
  {
    field: "relatedWikiSlugs",
    label: "관련 위키 slug",
    placeholder: "예: black-pyramid",
  },
  {
    field: "relatedPersonnelCodenames",
    label: "관련 인물 codename",
    placeholder: "예: AGENT_ZULU",
  },
  {
    field: "relatedCatalogSlugs",
    label: "관련 카탈로그 slug",
    placeholder: "예: camo-kit",
  },
];

export default function ReportReferenceFields({ values, onChange }: Props) {
  return (
    <div>
      <PanelTitle>STRUCTURED LORE LINKS</PanelTitle>
      <p className={styles.referenceHint}>
        자동 추론과 별개로 반드시 연결할 식별자를 한 줄에 하나씩 입력하세요.
        저장된 값은 로어 그래프와 검색 인덱스의 명시적 관계로 사용됩니다.
      </p>
      <div className={styles.referenceGrid}>
        {FIELDS.map(({ field, label, placeholder }) => (
          <label key={field} className={styles.referenceField}>
            <span>{label}</span>
            <textarea
              className={styles.referenceTextarea}
              value={values[field]}
              onChange={(event) => onChange(field, event.target.value)}
              placeholder={placeholder}
              rows={4}
              spellCheck={false}
              autoComplete="off"
            />
          </label>
        ))}
      </div>
    </div>
  );
}
