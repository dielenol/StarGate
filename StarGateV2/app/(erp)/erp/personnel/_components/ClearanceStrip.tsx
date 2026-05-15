"use client";

import { useState } from "react";

import {
  AGENT_LEVEL_LABELS,
  type AgentLevel,
} from "@/types/character";

import { getLevelDisplayRank } from "@/lib/personnel";

import Button from "@/components/ui/Button/Button";
import Pips from "@/components/ui/Pips/Pips";

import ClearanceGuideModal from "./ClearanceGuideModal";

import styles from "./ClearanceStrip.module.css";

interface Props {
  /** 현재 사용자 권한 등급. clrPill 톤 + 본문 강조 + 가이드 모달의 active row 에 사용. */
  clearance: AgentLevel;
  /**
   * "등급 안내" 버튼 + 내장 모달을 노출하지 않는다. dossier 상세처럼 호출부가
   * 모달 토글을 직접 들고 가서 다른 위치(예: DossierTabs 슬롯)에 배치할 때 사용.
   */
  hideGuideButton?: boolean;
}

/**
 * 권한 등급 컨텍스트 strip — personnel list/detail 양쪽에서 재사용.
 *
 * 한 줄 통합 구성: [권한등급 pill + Pips] [본문 안내] [등급 안내 버튼] [SOURCE].
 * "등급 안내" 버튼 클릭 시 ClearanceGuideModal 자체 토글.
 * `hideGuideButton` 이면 버튼과 모달을 모두 빼서 호출부가 책임진다.
 */
export default function ClearanceStrip({ clearance, hideGuideButton }: Props) {
  const [guideOpen, setGuideOpen] = useState(false);

  return (
    <>
      <div className={styles.strip}>
        <span className={styles.strip__pill} data-rank={clearance}>
          <span>
            권한등급: {clearance} - {AGENT_LEVEL_LABELS[clearance]}
          </span>
          <Pips total={7} filled={getLevelDisplayRank(clearance)} />
        </span>
        <span className={styles.strip__body}>
          내 열람 등급{" "}
          <span className={styles.strip__level}>{clearance}</span> — 이 등급
          이상의 필드만 노출됩니다. 상위 등급 필드는{" "}
          <span className={styles.strip__classified}>CLASSIFIED</span> 로
          표시됩니다.
        </span>
        {hideGuideButton ? null : (
          <Button size="sm" onClick={() => setGuideOpen(true)}>
            등급 안내
          </Button>
        )}
        <span className={styles.strip__source}>SOURCE · 인사 등록부</span>
      </div>

      {!hideGuideButton && guideOpen ? (
        <ClearanceGuideModal
          current={clearance}
          onClose={() => setGuideOpen(false)}
        />
      ) : null}
    </>
  );
}
