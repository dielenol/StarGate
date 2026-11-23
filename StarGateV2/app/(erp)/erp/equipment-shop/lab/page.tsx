import EquipmentShopClient from "../EquipmentShopClient";
import EquipmentShopComingSoon from "../EquipmentShopComingSoon";
import EquipmentShopSuspendedNotice from "../EquipmentShopSuspendedNotice";
import { requireEquipmentShopSession } from "../_access";
import { loadEquipmentShopPageData } from "../_data";

export const metadata = {
  title: "신체증강 연구소 · 병기부 · Stargate ERP",
};

export default async function EquipmentShopLabPage() {
  const { canPreview, suspended } = await requireEquipmentShopSession(
    "/erp/equipment-shop/lab",
  );
  if (!canPreview) {
    return <EquipmentShopComingSoon suspended={suspended} />;
  }

  const data = await loadEquipmentShopPageData({
    requireGm: false,
    includeCatalog: false,
  });

  return (
    <>
      {suspended ? <EquipmentShopSuspendedNotice /> : null}
      <EquipmentShopClient {...data} mode="zone" initialZone="lab" />
    </>
  );
}
