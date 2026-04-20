import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";

import Box from "@/components/ui/Box/Box";
import PageHead from "@/components/ui/PageHead/PageHead";
import Tag from "@/components/ui/Tag/Tag";

import styles from "./page.module.css";

export default async function HallOfFamePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <>
      <PageHead
        breadcrumb="ERP / HALL OF FAME"
        title="명예의 전당"
        right={<Tag tone="p2">P2 · 준비중</Tag>}
      />

      <Box>
        <div className={styles.placeholder}>
          <div className={styles.placeholder__title}>HALL OF FAME</div>
          <p className={styles.placeholder__message}>
            MVP · 훈장 · 전설 헌액 시스템은 현재 준비 중입니다.
          </p>
          <p className={styles.placeholder__hint}>
            세션 참여 집계와 훈장 수여 데이터 모델이 먼저 필요합니다.
          </p>
        </div>
      </Box>
    </>
  );
}
