import { isArmoryBureauSuspended } from "@/lib/equipment-shop/suspension";

import EquipmentShopClient from "../EquipmentShopClient";
import EquipmentShopComingSoon from "../EquipmentShopComingSoon";
import EquipmentShopSuspendedNotice from "../EquipmentShopSuspendedNotice";
import { requireEquipmentShopSession } from "../_access";
import { loadEquipmentShopPageData } from "../_data";

export const metadata = {
  title: "토와스키 건샵 · 병기부 · Stargate ERP",
};

export default async function EquipmentShopTowaskiPage() {
  // 평소에는 layout 의 운영 잠금 게이트만 적용한다. 운영 중지 중에만 GM 열람 가드를 건다.
  const suspended = isArmoryBureauSuspended();
  if (suspended) {
    const { canPreview } = await requireEquipmentShopSession(
      "/erp/equipment-shop/towaski",
    );
    if (!canPreview) return <EquipmentShopComingSoon suspended />;
  }

  const data = await loadEquipmentShopPageData({
    requireGm: false,
    includeResearch: false,
    catalogZone: "towaski",
  });

  return (
    <>
      {suspended ? <EquipmentShopSuspendedNotice /> : null}
      <EquipmentShopClient {...data} mode="zone" initialZone="towaski" />
    </>
  );
}
