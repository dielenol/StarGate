"use client";

import type { CreditKpiSnapshot } from "@/types/credit-admin";

import { useCreditKpi } from "@/hooks/queries/useCreditsAdminQuery";

import Box from "@/components/ui/Box/Box";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";

import { formatDate } from "@/lib/format/date";

import styles from "./page.module.css";

interface Props {
  initialData: CreditKpiSnapshot;
}

export default function CreditKpiBoard({ initialData }: Props) {
  const { data } = useCreditKpi({ initialData });

  // useQuery 가 initialData 로 시드되어 항상 truthy. 안전 fallback 만 표시.
  const kpi = data ?? initialData;

  return (
    <div className={styles.credits__kpiGrid}>
      <Box variant="gold">
        <PanelTitle>TOTAL BALANCE</PanelTitle>
        <div className={styles.credits__bigNum}>
          ¤ {kpi.totalBalance.toLocaleString()}
        </div>
        <Eyebrow>전체 발행량</Eyebrow>
      </Box>

      <Box>
        <PanelTitle>ACTIVE AGENTS</PanelTitle>
        <div className={styles.credits__bigNum}>{kpi.activeAgentCount}</div>
        <Eyebrow>운영 캐릭 수 (MAIN)</Eyebrow>
      </Box>

      <Box>
        <PanelTitle right={<span className={styles.credits__mono}>24H</span>}>
          GRANTED
        </PanelTitle>
        <div className={styles.credits__bigNum}>
          +{kpi.totalGranted24h.toLocaleString()}
        </div>
      </Box>

      <Box>
        <PanelTitle right={<span className={styles.credits__mono}>24H</span>}>
          DEDUCTED
        </PanelTitle>
        <div className={styles.credits__bigNumNeg}>
          -{kpi.totalDeducted24h.toLocaleString()}
        </div>
      </Box>

      <Box>
        <PanelTitle>OP POOL</PanelTitle>
        {kpi.opPoolBalance !== null ? (
          <>
            <div className={styles.credits__bigNum}>
              ¤ {kpi.opPoolBalance.toLocaleString()}
            </div>
            {kpi.opPoolUpdatedAt ? (
              <Eyebrow>
                UPDATED · {formatDate(new Date(kpi.opPoolUpdatedAt))}
              </Eyebrow>
            ) : null}
          </>
        ) : (
          <div className={styles.credits__warn}>
            OP 풀 미생성 — 작전풀 섹션에서 INIT
          </div>
        )}
      </Box>
    </div>
  );
}
