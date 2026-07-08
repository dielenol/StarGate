import Box from "@/components/ui/Box/Box";
import PageHead from "@/components/ui/PageHead/PageHead";
import Tag from "@/components/ui/Tag/Tag";

import styles from "./EquipmentShopComingSoon.module.css";

export default function EquipmentShopComingSoon() {
  return (
    <div data-pixel-font="ui">
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "ARMORY" },
        ]}
        title="병기부"
        right={<Tag tone="p1">GM 전용 · 준비중</Tag>}
      />

      <Box>
        <div className={styles.placeholder}>
          <div className={styles.placeholder__title}>ARMORY BUREAU</div>
          <p className={styles.placeholder__message}>
            병기부 장비 구매와 연구 기능은 현재 준비 중입니다.
          </p>
          <p className={styles.placeholder__hint}>
            운영 검수 완료 후 정식 개방됩니다.
          </p>
        </div>
      </Box>
    </div>
  );
}
