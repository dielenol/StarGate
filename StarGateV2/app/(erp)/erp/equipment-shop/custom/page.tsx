import EquipmentShopClient from "../EquipmentShopClient";
import { loadEquipmentShopPageData } from "../_data";

export const metadata = {
  title: "전용무기 제작소 · 병기부 · Stargate ERP",
};

export default async function EquipmentShopCustomPage() {
  const data = await loadEquipmentShopPageData();

  return <EquipmentShopClient {...data} mode="zone" initialZone="custom" />;
}
