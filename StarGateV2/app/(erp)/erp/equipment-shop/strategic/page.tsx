import EquipmentShopClient from "../EquipmentShopClient";
import EquipmentShopComingSoon from "../EquipmentShopComingSoon";
import { requireEquipmentShopSession } from "../_access";
import { loadEquipmentShopPageData } from "../_data";

export const metadata = {
  title: "전략 장비 보급소 · 병기부 · Stargate ERP",
};

export default async function EquipmentShopStrategicPage() {
  const { canPreview } = await requireEquipmentShopSession();
  if (!canPreview) {
    return <EquipmentShopComingSoon />;
  }

  const data = await loadEquipmentShopPageData({ requireGm: false });

  return <EquipmentShopClient {...data} mode="zone" initialZone="strategic" />;
}
