import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";

import Box from "@/components/ui/Box/Box";
import PageHead from "@/components/ui/PageHead/PageHead";
import Tag from "@/components/ui/Tag/Tag";

import styles from "./page.module.css";

export default async function MissionsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <>
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "MISSIONS" },
        ]}
        title="미션 보드"
        right={<Tag tone="p1">P1 · 준비중</Tag>}
      />

      <Box>
        <div className={styles.placeholder}>
          <div className={styles.placeholder__title}>MISSION BOARD</div>
          <p className={styles.placeholder__message}>
            GM이 게시하는 미션을 확인하고 신청하는 기능은 현재 준비 중입니다.
          </p>
          <p className={styles.placeholder__hint}>
            난이도 · 보상 · 참여 인원 태그, 신청/수락 플로우가 곧 추가됩니다.
          </p>
        </div>
      </Box>
    </>
  );
}
