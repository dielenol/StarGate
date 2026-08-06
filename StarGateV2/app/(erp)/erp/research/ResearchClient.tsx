"use client";

import { useRef } from "react";

import Image from "next/image";

import type { ZuluSampleLabOverview } from "@/lib/research/zulu-sample-lab";

import {
  useExtractZuluSample,
  useUnlockZuluSampleLine,
} from "@/hooks/mutations/useResearchMutation";
import {
  ResearchApiError,
  useZuluSampleLab,
} from "@/hooks/queries/useResearchQuery";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";
import Tag from "@/components/ui/Tag/Tag";

import { formatDateTime } from "@/lib/format/date";
import {
  clearRetainedIdempotencyOperation,
  retainIdempotencyOperation,
  type RetainedIdempotencyOperation,
} from "@/lib/query/idempotency";
import {
  ZULU_SAMPLE_LINE_ID,
  getZuluExtractionRecipe,
} from "@/lib/research/zulu-sample-lab";

import styles from "./page.module.css";
import XenoGuide from "./XenoGuide";

interface ResearchClientProps {
  isGm: boolean;
}

function errorMessage(error: unknown): string | null {
  if (error instanceof ResearchApiError) return error.message;
  if (error instanceof Error) return error.message;
  return null;
}

function eligibilityMessage(
  viewer: ZuluSampleLabOverview["viewer"],
): string | null {
  if (viewer.eligibilityCode === "MAIN_CHARACTER_INTEGRITY") {
    return "MAIN AGENT 캐릭터 정합성을 운영자가 확인해야 합니다.";
  }
  if (viewer.eligibilityCode === "NO_MAIN_CHARACTER") {
    return "샘플 추출에는 본인 소유 MAIN AGENT 캐릭터가 필요합니다.";
  }
  return null;
}

function hasRegisteredRecipeContract(data: ZuluSampleLabOverview): boolean {
  const recipe = getZuluExtractionRecipe(data.recipe.id);
  return Boolean(
    recipe &&
      recipe.id === ZULU_SAMPLE_LINE_ID &&
      data.source.slug === recipe.source.slug &&
      data.source.image === recipe.source.image &&
      data.recipe.sourceQuantity === recipe.source.quantity &&
      data.sample.slug === recipe.output.slug &&
      data.sample.image === recipe.output.image &&
      data.recipe.initialOutputQuantity === recipe.output.initialQuantity &&
      data.recipe.extractionOutputQuantity ===
        recipe.output.extractionQuantity &&
      data.extractionCost === recipe.extraction.creditCost,
  );
}

export default function ResearchClient({ isGm }: ResearchClientProps) {
  const unlockOperationRef = useRef<RetainedIdempotencyOperation | null>(null);
  const extractOperationRef = useRef<RetainedIdempotencyOperation | null>(null);
  const overview = useZuluSampleLab();
  const unlock = useUnlockZuluSampleLine();
  const extract = useExtractZuluSample();

  if (overview.isPending) {
    return <Box className={styles.stateBox}>연구 상태를 불러오는 중입니다.</Box>;
  }
  if (overview.isError || !overview.data) {
    return (
      <Box className={styles.stateBox}>
        {errorMessage(overview.error) ?? "연구 상태를 불러오지 못했습니다."}
      </Box>
    );
  }

  const data = overview.data;
  if (!hasRegisteredRecipeContract(data)) {
    return (
      <Box className={styles.stateBox}>
        등록되지 않은 추출 레시피입니다. 연구 작업은 실행되지 않습니다.
      </Box>
    );
  }

  const unlocked = data.line !== null;
  const balance = data.viewer.balance;
  const eligibility = eligibilityMessage(data.viewer);
  const hasEnoughCredits =
    balance !== null && balance >= data.extractionCost;
  const canUnlock =
    isGm &&
    !unlocked &&
    data.source.sharedQuantity >= data.recipe.sourceQuantity;
  const canExtract =
    unlocked &&
    data.viewer.eligibilityCode === "ELIGIBLE" &&
    hasEnoughCredits;
  const mutationError = errorMessage(unlock.error) ?? errorMessage(extract.error);

  const handleUnlock = () => {
    if (
      !window.confirm(
        `공용 ${data.source.name} ${data.recipe.sourceQuantity}개를 제출하고 샘플 라인을 개방하시겠습니까?`,
      )
    ) {
      return;
    }
    extract.reset();
    const operation = retainIdempotencyOperation(
      unlockOperationRef.current,
      "zulu-sample-line-unlock",
      data.recipe.id,
    );
    unlockOperationRef.current = operation;
    unlock.mutate(
      { confirmation: true, operationId: operation.key },
      {
        onSuccess: () => {
          unlockOperationRef.current = clearRetainedIdempotencyOperation(
            unlockOperationRef.current,
            operation.key,
          );
        },
      },
    );
  };

  const handleExtract = () => {
    if (
      !window.confirm(
        `${data.extractionCost.toLocaleString()} CR을 사용해 ${data.sample.name} ${data.recipe.extractionOutputQuantity}개를 공용 인벤토리에 추가하시겠습니까?`,
      )
    ) {
      return;
    }
    unlock.reset();
    const operation = retainIdempotencyOperation(
      extractOperationRef.current,
      "zulu-sample-extraction",
      JSON.stringify([
        data.recipe.id,
        data.viewer.character?.id ?? "unassigned",
        data.extractionCost,
      ]),
    );
    extractOperationRef.current = operation;
    extract.mutate(
      { confirmation: true, operationId: operation.key },
      {
        onSuccess: () => {
          extractOperationRef.current = clearRetainedIdempotencyOperation(
            extractOperationRef.current,
            operation.key,
          );
        },
      },
    );
  };

  return (
    <div className={styles.research}>
      <section className={styles.hero}>
        <div>
          <Eyebrow tone="gold">ZULU SAMPLE LAB · LINE 0028</Eyebrow>
          <h2>ZULU-0028 샘플 연구</h2>
          <p>
            공용 격리 개체를 제출해 샘플 라인을 개방하고, 개방 이후에는
            MAIN AGENT의 크레딧으로 깨진 음절을 추출합니다.
          </p>
        </div>
        <Tag tone={unlocked ? "success" : "danger"}>
          {unlocked ? "라인 개방" : "라인 잠김"}
        </Tag>
      </section>

      <XenoGuide
        unlocked={unlocked}
        sourceAvailable={
          data.source.sharedQuantity >= data.recipe.sourceQuantity
        }
        eligibilityCode={data.viewer.eligibilityCode}
        hasEnoughCredits={hasEnoughCredits}
        extractionCost={data.extractionCost}
      />

      <div className={styles.itemFlow}>
        <Box className={styles.itemCard}>
          <PanelTitle right={<Tag tone="info">공용 {data.source.sharedQuantity}</Tag>}>
            투입 시료
          </PanelTitle>
          <div className={styles.itemBody}>
            <div className={styles.imageFrame}>
              <Image
                src={data.source.image}
                alt={data.source.name}
                width={220}
                height={220}
                priority
              />
            </div>
            <div>
              <strong>{data.source.name}</strong>
              <p>
                최초 개방 시 공용 인벤토리에서
                {` ${data.recipe.sourceQuantity}개`}를 소모합니다.
              </p>
            </div>
          </div>
        </Box>

        <div className={styles.flowArrow} aria-hidden="true">
          →
        </div>

        <Box className={styles.itemCard} variant="gold">
          <PanelTitle right={<Tag tone="gold">공용 {data.sample.sharedQuantity}</Tag>}>
            추출 샘플
          </PanelTitle>
          <div className={styles.itemBody}>
            <div className={styles.imageFrame}>
              <Image
                src={data.sample.image}
                alt={data.sample.name}
                width={220}
                height={220}
              />
            </div>
            <div>
              <strong>{data.sample.name}</strong>
              <p>
                최초 개방 시 {data.recipe.initialOutputQuantity}개, 추출
                1회당 {data.recipe.extractionOutputQuantity}개가 공용
                인벤토리에 추가됩니다.
              </p>
            </div>
          </div>
        </Box>
      </div>

      <div className={styles.controlGrid}>
        <Box className={styles.controlCard}>
          <PanelTitle>최초 제출</PanelTitle>
          <dl className={styles.facts}>
            <div>
              <dt>권한</dt>
              <dd>GM</dd>
            </div>
            <div>
              <dt>소모</dt>
              <dd>
                {data.source.name} ×{data.recipe.sourceQuantity}
              </dd>
            </div>
            <div>
              <dt>최초 지급</dt>
              <dd>
                {data.sample.name} ×{data.recipe.initialOutputQuantity}
              </dd>
            </div>
          </dl>
          {data.line ? (
            <p className={styles.note}>
              {formatDateTime(data.line.unlockedAt)} · {data.line.unlockedByName}
              님이 개방
            </p>
          ) : isGm ? (
            <Button
              variant="primary"
              onClick={handleUnlock}
              disabled={!canUnlock || unlock.isPending}
            >
              {unlock.isPending ? "제출 처리 중…" : "격리 개체 제출"}
            </Button>
          ) : (
            <p className={styles.note}>GM의 최초 제출을 기다리고 있습니다.</p>
          )}
          {!unlocked && data.source.sharedQuantity < 1 ? (
            <p className={styles.warning}>공용 격리 개체 수량이 부족합니다.</p>
          ) : null}
        </Box>

        <Box className={styles.controlCard}>
          <PanelTitle>샘플 추출</PanelTitle>
          <dl className={styles.facts}>
            <div>
              <dt>사용 캐릭터</dt>
              <dd>{data.viewer.character?.codename ?? "미등록"}</dd>
            </div>
            <div>
              <dt>보유 크레딧</dt>
              <dd>{balance === null ? "—" : `${balance.toLocaleString()} CR`}</dd>
            </div>
            <div>
              <dt>추출 비용</dt>
              <dd>{data.extractionCost.toLocaleString()} CR</dd>
            </div>
          </dl>
          <Button
            variant="primary"
            onClick={handleExtract}
            disabled={!canExtract || extract.isPending}
          >
            {extract.isPending ? "추출 처리 중…" : "샘플 1개 추출"}
          </Button>
          {!unlocked ? (
            <p className={styles.note}>라인 개방 후 추출할 수 있습니다.</p>
          ) : eligibility ? (
            <p className={styles.warning}>{eligibility}</p>
          ) : !hasEnoughCredits ? (
            <p className={styles.warning}>추출 비용이 부족합니다.</p>
          ) : null}
        </Box>
      </div>

      {mutationError ? (
        <p className={styles.feedbackError} role="alert">
          {mutationError}
        </p>
      ) : unlock.isSuccess ? (
        <p className={styles.feedbackSuccess} role="status">
          ZULU-0028 샘플 라인이 개방되었습니다.
        </p>
      ) : extract.isSuccess ? (
        <p className={styles.feedbackSuccess} role="status">
          깨진 음절 1개가 공용 인벤토리에 추가되었습니다.
        </p>
      ) : null}
    </div>
  );
}
