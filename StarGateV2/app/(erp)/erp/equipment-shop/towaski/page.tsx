import EquipmentShopClient from "../EquipmentShopClient";
import EquipmentShopComingSoon from "../EquipmentShopComingSoon";
import { requireEquipmentShopSession } from "../_access";
import { loadEquipmentShopPageData } from "../_data";

export const metadata = {
  title: "토와스키 건샵 · 병기부 · Stargate ERP",
};

export default async function EquipmentShopTowaskiPage() {
  const { isGM } = await requireEquipmentShopSession();
  if (!isGM) {
    return <EquipmentShopComingSoon />;
  }

  const data = await loadEquipmentShopPageData();

  return <EquipmentShopClient {...data} mode="zone" initialZone="towaski" />;
}
