import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";

import Box from "@/components/ui/Box/Box";
import PageHead from "@/components/ui/PageHead/PageHead";
import Tag from "@/components/ui/Tag/Tag";

import styles from "./page.module.css";

export default async function ChroniclePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <>
      <PageHead
        breadcrumb="ERP / CHRONICLE"
        title="연대기"
        right={<Tag tone="p2">P2 · 준비중</Tag>}
      />

      <Box>
        <div className={styles.placeholder}>
          <div className={styles.placeholder__title}>WORLD CHRONICLE</div>
          <p className={styles.placeholder__message}>
            월드 타임라인과 내 캐릭터 오버레이는 현재 준비 중입니다.
          </p>
          <p className={styles.placeholder__hint}>
            세션 리포트를 시간 축에 투영하는 집계 파이프라인이 먼저 필요합니다.
          </p>
        </div>
      </Box>
    </>
  );
}
