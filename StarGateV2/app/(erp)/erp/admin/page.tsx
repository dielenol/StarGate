import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";

import Box from "@/components/ui/Box/Box";
import PageHead from "@/components/ui/PageHead/PageHead";
import Tag from "@/components/ui/Tag/Tag";

import styles from "./page.module.css";

export default async function AdminPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!hasRole(session.user.role, "GM")) {
    redirect("/erp");
  }

  return (
    <>
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "ADMIN" },
        ]}
        title="관리자"
        right={<Tag tone="p1">P1 · 준비중</Tag>}
      />

      <Box>
        <div className={styles.placeholder}>
          <div className={styles.placeholder__title}>ADMIN DASHBOARD</div>
          <p className={styles.placeholder__message}>
            통합 관리자 대시보드는 현재 준비 중입니다.
          </p>
          <p className={styles.placeholder__hint}>
            사용자 · 경제 · 시스템 운영 화면은 좌측 관리 메뉴에서 먼저 사용할 수 있습니다.
          </p>
        </div>
      </Box>
    </>
  );
}
