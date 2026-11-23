import EquipmentShopClient from "../EquipmentShopClient";
import EquipmentShopComingSoon from "../EquipmentShopComingSoon";
import EquipmentShopSuspendedNotice from "../EquipmentShopSuspendedNotice";
import { requireEquipmentShopSession } from "../_access";
import { loadEquipmentShopPageData } from "../_data";

export const metadata = {
  title: "아케론 대장간 · 병기부 · Stargate ERP",
};

export default async function EquipmentShopAcheronPage() {
  const { canPreview, suspended } = await requireEquipmentShopSession(
    "/erp/equipment-shop/acheron",
  );
  if (!canPreview) {
    return <EquipmentShopComingSoon suspended={suspended} />;
  }

  const data = await loadEquipmentShopPageData({
    requireGm: false,
    includeResearch: false,
    catalogZone: "acheron",
  });

  return (
    <>
      {suspended ? <EquipmentShopSuspendedNotice /> : null}
      <EquipmentShopClient {...data} mode="zone" initialZone="acheron" />
    </>
  );
}
