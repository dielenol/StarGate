"use client";

import { useState } from "react";

import type {
  AgentBalanceRow,
  CreditKpiSnapshot,
  CreditTransactionFilter,
  CreditTransactionPage,
  SessionRewardCandidate,
} from "@/types/credit-admin";

import type { OpPoolResponse } from "@/hooks/queries/useCreditsAdminQuery";

import Box from "@/components/ui/Box/Box";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";
import Stack from "@/components/ui/Stack/Stack";

import CreditBalanceTable from "./CreditBalanceTable";
import CreditBulkGrantForm from "./CreditBulkGrantForm";
import type { GrantTargetUser } from "./CreditGrantForm";
import CreditGrantForm from "./CreditGrantForm";
import CreditKpiBoard from "./CreditKpiBoard";
import CreditLogTable from "./CreditLogTable";
import CreditOpPoolPanel from "./CreditOpPoolPanel";
import CreditSessionRewardPanel from "./CreditSessionRewardPanel";

interface Props {
  initialKpi: CreditKpiSnapshot;
  initialBalances: { rows: AgentBalanceRow[]; generatedAt: string };
  initialLog: CreditTransactionPage;
  initialOpPool: OpPoolResponse;
  grantTargets: GrantTargetUser[];
  initialSessionCandidates: SessionRewardCandidate[];
}

const INITIAL_LOG_FILTER: CreditTransactionFilter = { limit: 50, skip: 0 };

export default function CreditsAdminClient({
  initialKpi,
  initialBalances,
  initialLog,
  initialOpPool,
  grantTargets,
  initialSessionCandidates,
}: Props) {
  // BalanceTable 행 클릭 → GrantForm prefill 신호.
  // GrantForm 이 prefill 적용 후 onPrefillConsumed 로 비워 재발화 차단.
  const [grantPrefill, setGrantPrefill] = useState<string | null>(null);

  // LogTable 필터. 부모가 보유해 페이지 전환/재진입 시 유지.
  const [logFilter, setLogFilter] = useState<CreditTransactionFilter>(
    INITIAL_LOG_FILTER,
  );

  return (
    <Stack gap="var(--gap)">
      <CreditKpiBoard initialData={initialKpi} />

      <Box>
        <PanelTitle>SINGLE GRANT</PanelTitle>
        <CreditGrantForm
          targets={grantTargets}
          prefillCharacterId={grantPrefill ?? undefined}
          onPrefillConsumed={() => setGrantPrefill(null)}
        />
      </Box>

      <Box>
        <PanelTitle>BULK GRANT</PanelTitle>
        <CreditBulkGrantForm targets={grantTargets} />
      </Box>

      <CreditBalanceTable
        initialData={initialBalances}
        onSelectCharacter={(charId) => setGrantPrefill(charId)}
      />

      <CreditLogTable
        initialData={initialLog}
        filter={logFilter}
        onFilterChange={setLogFilter}
      />

      <CreditOpPoolPanel initialData={initialOpPool} />

      <CreditSessionRewardPanel
        initialCandidates={initialSessionCandidates}
      />
    </Stack>
  );
}
