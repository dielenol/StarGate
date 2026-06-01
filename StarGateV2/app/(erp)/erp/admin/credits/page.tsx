import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";

import PageHead from "@/components/ui/PageHead/PageHead";

import {
  buildGrantTargets,
  buildInitialBalances,
  buildInitialKpi,
  buildInitialLog,
  buildInitialOpPool,
  buildInitialSessionCandidates,
} from "./_data";
import CreditsAdminClient from "./CreditsAdminClient";

function toClientData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export default async function CreditsAdminPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  // Defense-in-depth — admin layout 에서 이미 GM 가드됐지만
  // 라우트 단위에서도 중복 체크 (제거하지 말 것).
  if (!hasRole(session.user.role, "GM")) {
    redirect("/erp");
  }

  // 6종 초기 데이터 병렬 fetch — 라우트가 있지만 서버 컴포넌트는 동일 process 에서
  // lib/db 를 직접 호출해 fetch overhead 를 절약 (하이브리드 패턴 표준).
  // OP 풀은 KPI 스냅샷에도 잔액이 들어 있지만, P7 운영 패널이 useCreditOpPool 로
  // 별도 캐시를 운영하므로 본 빌더로도 시드해 재진입 시 즉시 표시.
  // 세션 후보는 daysBack=14 (기본) 시드 — 사용자가 패널에서 변경 시 자동 refetch.
  // 서버 fetch 실패는 빈 배열로 폴백 (클라이언트가 invalidate 후 라우트 호출).
  const [
    initialKpi,
    initialBalances,
    initialLog,
    initialOpPool,
    grantTargets,
    initialSessionCandidates,
  ] = await Promise.all([
    buildInitialKpi(),
    buildInitialBalances(),
    buildInitialLog(),
    buildInitialOpPool(),
    buildGrantTargets(),
    buildInitialSessionCandidates(14).catch(() => []),
  ]);

  return (
    <>
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "ADMIN", href: "/erp/admin/users" },
          { label: "CREDITS" },
        ]}
        title="크레딧 운영"
      />

      <CreditsAdminClient
        initialKpi={toClientData(initialKpi)}
        initialBalances={toClientData(initialBalances)}
        initialLog={toClientData(initialLog)}
        initialOpPool={toClientData(initialOpPool)}
        grantTargets={toClientData(grantTargets)}
        initialSessionCandidates={toClientData(initialSessionCandidates)}
      />
    </>
  );
}
