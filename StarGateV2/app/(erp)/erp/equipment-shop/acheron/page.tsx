import EquipmentShopClient from "../EquipmentShopClient";
import EquipmentShopComingSoon from "../EquipmentShopComingSoon";
import { requireEquipmentShopSession } from "../_access";
import { loadEquipmentShopPageData } from "../_data";

export const metadata = {
  title: "아케론 대장간 · 병기부 · Stargate ERP",
};

export default async function EquipmentShopAcheronPage() {
  const { canPreview } = await requireEquipmentShopSession("/erp/equipment-shop/acheron");
  if (!canPreview) {
    return <EquipmentShopComingSoon />;
  }

  const data = await loadEquipmentShopPageData({
    requireGm: false,
    includeResearch: false,
  });

  return <EquipmentShopClient {...data} mode="zone" initialZone="acheron" />;
}
