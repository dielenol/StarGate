import Box from "@/components/ui/Box/Box";
import PageHead from "@/components/ui/PageHead/PageHead";
import Tag from "@/components/ui/Tag/Tag";

import styles from "./EquipmentShopComingSoon.module.css";

interface EquipmentShopComingSoonProps {
  /** 병기부 운영 중지(ARMORY_BUREAU_ENABLED 미설정) 상태 안내로 전환한다. */
  suspended?: boolean;
}

export default function EquipmentShopComingSoon({
  suspended = false,
}: EquipmentShopComingSoonProps) {
  return (
    <div data-pixel-font="ui">
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "ARMORY" },
        ]}
        title="병기부"
        right={
          <Tag tone="p1">{suspended ? "운영 중지" : "GM 전용 · 준비중"}</Tag>
        }
      />

      <Box>
        <div className={styles.placeholder}>
          <div className={styles.placeholder__title}>ARMORY BUREAU</div>
          <p className={styles.placeholder__message}>
            {suspended
              ? "병기부 장비 구매·연구·공방 기능은 현재 운영이 중지되었습니다."
              : "병기부 장비 구매와 연구 기능은 현재 준비 중입니다."}
          </p>
          <p className={styles.placeholder__hint}>
            {suspended
              ? "운영 재개 시 다시 안내됩니다."
              : "운영 검수 완료 후 정식 개방됩니다."}
          </p>
        </div>
      </Box>
    </div>
  );
}
