/**
 * 병기부 · Stargate ERP
 *
 * 병기부 통합 관제 허브.
 */

import EquipmentShopClient from "./EquipmentShopClient";
import EquipmentShopComingSoon from "./EquipmentShopComingSoon";
import { requireEquipmentShopSession } from "./_access";
import { loadEquipmentShopPageData } from "./_data";

export const metadata = {
  title: "병기부 · Stargate ERP",
};

export default async function EquipmentShopPage() {
  const { isGM } = await requireEquipmentShopSession();
  if (!isGM) {
    return <EquipmentShopComingSoon />;
  }

  const data = await loadEquipmentShopPageData();

  return (
    <EquipmentShopClient
      {...data}
      mode="hub"
    />
  );
}
