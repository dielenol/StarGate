import Box from "@/components/ui/Box/Box";
import PageHead from "@/components/ui/PageHead/PageHead";
import Tag from "@/components/ui/Tag/Tag";

import styles from "./FactionsComingSoon.module.css";

export default function FactionsComingSoon() {
  return (
    <div data-pixel-font="ui">
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "FACTIONS" },
        ]}
        title="세력도"
        right={<Tag tone="p1">GM 전용 · 준비중</Tag>}
      />

      <Box>
        <div className={styles.placeholder}>
          <div className={styles.placeholder__title}>FACTION MAP</div>
          <p className={styles.placeholder__message}>
            세력도와 접선 기록은 현재 준비 중입니다.
          </p>
          <p className={styles.placeholder__hint}>
            운영 검수 완료 후 정식 열람이 개방됩니다.
          </p>
        </div>
      </Box>
    </div>
  );
}
