import { getEquipmentResearchCapabilities } from "@/lib/db/equipment-research";

import EquipmentShopClient from "../EquipmentShopClient";
import { loadEquipmentShopPageData } from "../_data";

export const metadata = {
  title: "공방 · 병기부 · Stargate ERP",
};

export default async function EquipmentShopCustomPage() {
  const data = await loadEquipmentShopPageData({
    requireGm: false,
    includeCatalog: false,
    includeResearch: false,
  });
  const capabilities = await getEquipmentResearchCapabilities(
    data.mainCharacter?.id ?? null,
  );

  return (
    <EquipmentShopClient
      {...data}
      initialResearch={{ ...data.initialResearch, capabilities }}
      mode="zone"
      initialZone="custom"
    />
  );
}
