/**
 * 병기부 · Stargate ERP
 *
 * 병기부 통합 관제 허브.
 */

import EquipmentShopClient from "./EquipmentShopClient";
import EquipmentShopComingSoon from "./EquipmentShopComingSoon";
import EquipmentShopSuspendedNotice from "./EquipmentShopSuspendedNotice";
import { requireEquipmentShopSession } from "./_access";
import { loadEquipmentShopPageData } from "./_data";

export const metadata = {
  title: "병기부 · Stargate ERP",
};

export default async function EquipmentShopPage() {
  const { canPreview, suspended } = await requireEquipmentShopSession();
  if (!canPreview) {
    return <EquipmentShopComingSoon suspended={suspended} />;
  }

  const data = await loadEquipmentShopPageData({ requireGm: false });

  return (
    <>
      {suspended ? <EquipmentShopSuspendedNotice /> : null}
      <EquipmentShopClient
        {...data}
        mode="hub"
      />
    </>
  );
}
