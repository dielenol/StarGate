import EquipmentShopClient from "../EquipmentShopClient";
import EquipmentShopComingSoon from "../EquipmentShopComingSoon";
import { requireEquipmentShopSession } from "../_access";
import { loadEquipmentShopPageData } from "../_data";

export const metadata = {
  title: "공방 · 병기부 · Stargate ERP",
};

export default async function EquipmentShopCustomPage() {
  const { isGM } = await requireEquipmentShopSession();
  if (!isGM) {
    return <EquipmentShopComingSoon />;
  }

  const data = await loadEquipmentShopPageData();

  return <EquipmentShopClient {...data} mode="zone" initialZone="custom" />;
}
