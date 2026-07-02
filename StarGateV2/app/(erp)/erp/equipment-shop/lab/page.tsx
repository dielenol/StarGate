import EquipmentShopClient from "../EquipmentShopClient";
import { loadEquipmentShopPageData } from "../_data";

export const metadata = {
  title: "병기 연구소 · 병기부 · Stargate ERP",
};

export default async function EquipmentShopLabPage() {
  const data = await loadEquipmentShopPageData();

  return <EquipmentShopClient {...data} mode="zone" initialZone="lab" />;
}
