import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";

import Box from "@/components/ui/Box/Box";
import PageHead from "@/components/ui/PageHead/PageHead";
import Tag from "@/components/ui/Tag/Tag";

import styles from "./page.module.css";

export const metadata = {
  title: "주식 — Stargate ERP",
};

export default async function StockPage() {
  // TODO(M3): 주식 접근 권한 정의 (현재는 ERP 로그인만 통과). nav-config minRole 도 동반 설정.
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <>
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "STOCK" },
        ]}
        title="주식"
        right={<Tag tone="info">준비중</Tag>}
      />

      <Box>
        <div className={styles.placeholder}>
          <div className={styles.placeholder__title}>STOCK MARKET</div>
          <p className={styles.placeholder__message}>
            티커별 가격 차트와 매수/매도는 현재 준비 중입니다.
          </p>
          <p className={styles.placeholder__hint}>
            가격 히스토리(30일 TTL) · 보유 포지션 · 체결 룰이 곧 활성화됩니다.
          </p>
        </div>
      </Box>
    </>
  );
}
