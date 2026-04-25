import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";

import Box from "@/components/ui/Box/Box";
import PageHead from "@/components/ui/PageHead/PageHead";
import Tag from "@/components/ui/Tag/Tag";

import styles from "./page.module.css";

export default async function GalleryPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <>
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "GALLERY" },
        ]}
        title="갤러리"
        right={<Tag tone="p2">P2 · 준비중</Tag>}
      />

      <Box>
        <div className={styles.placeholder}>
          <div className={styles.placeholder__title}>GALLERY</div>
          <p className={styles.placeholder__message}>
            세션 앨범 · 팬아트 그리드는 현재 준비 중입니다.
          </p>
          <p className={styles.placeholder__hint}>
            이미지 업로드 · 스토리지 연동이 먼저 필요합니다.
          </p>
        </div>
      </Box>
    </>
  );
}
