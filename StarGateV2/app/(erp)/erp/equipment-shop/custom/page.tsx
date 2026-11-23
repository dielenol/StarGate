import { getEquipmentResearchCapabilities } from "@/lib/db/equipment-research";
import { isArmoryBureauSuspended } from "@/lib/equipment-shop/suspension";

import EquipmentShopClient from "../EquipmentShopClient";
import EquipmentShopComingSoon from "../EquipmentShopComingSoon";
import EquipmentShopSuspendedNotice from "../EquipmentShopSuspendedNotice";
import { requireEquipmentShopSession } from "../_access";
import { loadEquipmentShopPageData } from "../_data";

export const metadata = {
  title: "공방 · 병기부 · Stargate ERP",
};

export default async function EquipmentShopCustomPage() {
  // 평소에는 layout 의 운영 잠금 게이트만 적용한다. 운영 중지 중에만 GM 열람 가드를 건다.
  const suspended = isArmoryBureauSuspended();
  if (suspended) {
    const { canPreview } = await requireEquipmentShopSession(
      "/erp/equipment-shop/custom",
    );
    if (!canPreview) return <EquipmentShopComingSoon suspended />;
  }

  const data = await loadEquipmentShopPageData({
    requireGm: false,
    includeCatalog: false,
    includeResearch: false,
  });
  const capabilities = await getEquipmentResearchCapabilities(
    data.mainCharacter?.id ?? null,
  );

  return (
    <>
      {suspended ? <EquipmentShopSuspendedNotice /> : null}
      <EquipmentShopClient
        {...data}
        initialResearch={{ ...data.initialResearch, capabilities }}
        mode="zone"
        initialZone="custom"
      />
    </>
  );
}
