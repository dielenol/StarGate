"use client";

import { useState } from "react";

import Image from "next/image";

import type { ZuluSampleEligibilityCode } from "@/lib/research/zulu-sample-lab";

import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import Tag from "@/components/ui/Tag/Tag";

import styles from "./page.module.css";

const XENO_PROFILE_IMAGE = "/assets/npcs/Xeno-profile.webp";

interface XenoGuideProps {
  unlocked: boolean;
  sourceAvailable: boolean;
  eligibilityCode: ZuluSampleEligibilityCode;
  hasEnoughCredits: boolean;
  extractionCost: number;
}

function dialogueForState(props: XenoGuideProps): string {
  if (!props.unlocked && !props.sourceAvailable) {
    return "빈손으로 와서 뭘 추출해. 공용 인벤토리부터 채우고 다시 와.";
  }
  if (!props.unlocked) {
    return "그거 내려놔. 제출할 거면 지금 하고, 손 떨 거면 비켜.";
  }
  if (props.eligibilityCode !== "ELIGIBLE") {
    return "본인 MAIN 요원도 확인 안 되는데 결제는 무슨. 순서부터 배우고 와.";
  }
  if (!props.hasEnoughCredits) {
    return "크레딧도 모자라면서 추출부터 찾냐. 잔액 맞춰 오면 그때 상대해 주지.";
  }
  return `라인은 열어 놨어. ${props.extractionCost.toLocaleString()} 크레딧 준비됐으면 눌러. 설명은 한 번이면 충분하잖아.`;
}

export default function XenoGuide(props: XenoGuideProps) {
  const [imageUnavailable, setImageUnavailable] = useState(false);

  return (
    <aside className={styles.xenoGuide} aria-labelledby="xeno-guide-name">
      <div className={styles.xenoPortrait}>
        {imageUnavailable ? (
          <div
            className={styles.xenoPortraitFallback}
            role="img"
            aria-label="제노 임시 프로필 이미지 준비 중"
          >
            <span>제노</span>
          </div>
        ) : (
          <Image
            src={XENO_PROFILE_IMAGE}
            alt="제노 임시 프로필"
            width={320}
            height={420}
            sizes="(max-width: 700px) 100vw, 260px"
            onError={() => setImageUnavailable(true)}
          />
        )}
      </div>
      <div className={styles.xenoCopy}>
        <div className={styles.xenoHeading}>
          <div>
            <Eyebrow tone="gold">RESEARCH CHANNEL</Eyebrow>
            <h3 id="xeno-guide-name">제노</h3>
          </div>
          <Tag tone="info">임시 안내</Tag>
        </div>
        <blockquote>“{dialogueForState(props)}”</blockquote>
        <p>
          격리 개체 제출과 샘플 추출 절차만 안내합니다. 영문 표기·신원·등급·
          소속은 아직 등록되지 않았습니다.
        </p>
      </div>
    </aside>
  );
}
