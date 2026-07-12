import EquipmentShopClient from "../EquipmentShopClient";
import EquipmentShopComingSoon from "../EquipmentShopComingSoon";
import { requireEquipmentShopSession } from "../_access";
import { loadEquipmentShopPageData } from "../_data";

export const metadata = {
  title: "신체증강 연구소 · 병기부 · Stargate ERP",
};

export default async function EquipmentShopLabPage() {
  const { canPreview } = await requireEquipmentShopSession("/erp/equipment-shop/lab");
  if (!canPreview) {
    return <EquipmentShopComingSoon />;
  }

  const data = await loadEquipmentShopPageData({ requireGm: false });

  return <EquipmentShopClient {...data} mode="zone" initialZone="lab" />;
}
