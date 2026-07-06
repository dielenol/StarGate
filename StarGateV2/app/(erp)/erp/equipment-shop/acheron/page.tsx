import EquipmentShopClient from "../EquipmentShopClient";
import { loadEquipmentShopPageData } from "../_data";

export const metadata = {
  title: "아케론 대장간 · 병기부 · Stargate ERP",
};

export default async function EquipmentShopAcheronPage() {
  const data = await loadEquipmentShopPageData();

  return <EquipmentShopClient {...data} mode="zone" initialZone="acheron" />;
}
