import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";

import Box from "@/components/ui/Box/Box";
import PageHead from "@/components/ui/PageHead/PageHead";
import Tag from "@/components/ui/Tag/Tag";

import styles from "./page.module.css";

export const metadata = {
  title: "편의점 — Stargate ERP",
};

export default async function ShopPage() {
  // TODO(M2): 편의점 접근 권한 정의 (현재는 ERP 로그인만 통과). nav-config minRole 도 동반 설정.
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <>
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "SHOP" },
        ]}
        title="편의점"
        right={<Tag tone="info">준비중</Tag>}
      />

      <Box>
        <div className={styles.placeholder}>
          <div className={styles.placeholder__title}>CONVENIENCE STORE</div>
          <p className={styles.placeholder__message}>
            일자별 재고와 가격으로 구매하는 편의점은 현재 준비 중입니다.
          </p>
          <p className={styles.placeholder__hint}>
            13 품목 · 4 그룹 · KST 일자 단위 재고 시드 · 주말 18시 마감 룰이 곧 활성화됩니다.
          </p>
        </div>
      </Box>
    </>
  );
}
