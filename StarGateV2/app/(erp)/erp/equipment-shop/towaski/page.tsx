import EquipmentShopClient from "../EquipmentShopClient";
import { loadEquipmentShopPageData } from "../_data";

export const metadata = {
  title: "토와스키 장비 판매점 · 병기부 · Stargate ERP",
};

export default async function EquipmentShopTowaskiPage() {
  const data = await loadEquipmentShopPageData();

  return <EquipmentShopClient {...data} mode="zone" initialZone="towaski" />;
}
