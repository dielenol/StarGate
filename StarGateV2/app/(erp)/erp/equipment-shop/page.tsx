/**
 * 병기부 · Stargate ERP
 *
 * 병기부 안내데스크 허브.
 */

import EquipmentShopClient from "./EquipmentShopClient";
import { loadEquipmentShopPageData } from "./_data";

export const metadata = {
  title: "병기부 · Stargate ERP",
};

export default async function EquipmentShopPage() {
  const data = await loadEquipmentShopPageData();

  return (
    <EquipmentShopClient
      {...data}
      mode="hub"
    />
  );
}
