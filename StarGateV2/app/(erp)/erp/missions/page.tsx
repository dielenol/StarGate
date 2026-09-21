import { requireGmPageSession } from "@/lib/auth/require-gm-page";

import Box from "@/components/ui/Box/Box";
import PageHead from "@/components/ui/PageHead/PageHead";
import Tag from "@/components/ui/Tag/Tag";

import styles from "./page.module.css";

export default async function MissionsPage() {
  await requireGmPageSession();

  return (
    <div data-pixel-font="ui">
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "미완성", href: "/erp/admin/unfinished" },
          { label: "MISSIONS" },
        ]}
        title="미션 보드"
        right={<Tag>개발 중단</Tag>}
      />

      <Box>
        <div className={styles.placeholder}>
          <div className={styles.placeholder__title}>MISSION BOARD</div>
          <p className={styles.placeholder__message}>
            미션 게시·조회·신청 기능이 구현되지 않은 페이지입니다.
          </p>
          <p className={styles.placeholder__hint}>
            개발을 중단하고 GM 보관용으로 유지합니다.
          </p>
        </div>
      </Box>
    </div>
  );
}
