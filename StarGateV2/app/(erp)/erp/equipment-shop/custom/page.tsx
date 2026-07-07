import EquipmentShopClient from "../EquipmentShopClient";
import { loadEquipmentShopPageData } from "../_data";

export const metadata = {
  title: "공방 · 병기부 · Stargate ERP",
};

export default async function EquipmentShopCustomPage() {
  const data = await loadEquipmentShopPageData();

  return <EquipmentShopClient {...data} mode="zone" initialZone="custom" />;
}
