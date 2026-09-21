import { requireGmPageSession } from "@/lib/auth/require-gm-page";

import Box from "@/components/ui/Box/Box";
import PageHead from "@/components/ui/PageHead/PageHead";
import Tag from "@/components/ui/Tag/Tag";

import styles from "./page.module.css";

export default async function ChroniclePage() {
  await requireGmPageSession();

  return (
    <div data-pixel-font="ui">
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "미완성", href: "/erp/admin/unfinished" },
          { label: "CHRONICLE" },
        ]}
        title="연대기"
        right={<Tag>개발 중단</Tag>}
      />

      <Box>
        <div className={styles.placeholder}>
          <div className={styles.placeholder__title}>WORLD CHRONICLE</div>
          <p className={styles.placeholder__message}>
            월드 타임라인과 캐릭터 기록이 구현되지 않은 페이지입니다.
          </p>
          <p className={styles.placeholder__hint}>
            개발을 중단하고 GM 보관용으로 유지합니다.
          </p>
        </div>
      </Box>
    </div>
  );
}
