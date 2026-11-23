import EquipmentShopClient from "../EquipmentShopClient";
import EquipmentShopComingSoon from "../EquipmentShopComingSoon";
import EquipmentShopSuspendedNotice from "../EquipmentShopSuspendedNotice";
import { requireEquipmentShopSession } from "../_access";
import { loadEquipmentShopPageData } from "../_data";

export const metadata = {
  title: "전략 장비 보급소 · 병기부 · Stargate ERP",
};

export default async function EquipmentShopStrategicPage() {
  const { canPreview, suspended } = await requireEquipmentShopSession(
    "/erp/equipment-shop/strategic",
  );
  if (!canPreview) {
    return <EquipmentShopComingSoon suspended={suspended} />;
  }

  const data = await loadEquipmentShopPageData({
    requireGm: false,
    includeResearch: false,
    catalogZone: "strategic",
  });

  return (
    <>
      {suspended ? <EquipmentShopSuspendedNotice /> : null}
      <EquipmentShopClient {...data} mode="zone" initialZone="strategic" />
    </>
  );
}
