import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";

import { buildEquipmentShopCatalogResponse } from "../_data";

import EquipmentSimulatorClient from "./EquipmentSimulatorClient";

export const metadata = {
  title: "장비 시뮬레이터 · 병기부 · Stargate ERP",
};

export default async function EquipmentShopSimulatorPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  if (!hasRole(session.user.role, "GM")) {
    redirect("/erp");
  }

  const catalog = await buildEquipmentShopCatalogResponse().catch(() => ({
    items: [],
    isOpen: true,
    mode: "open" as const,
    scheduledOpen: true,
    forceOpen: true,
    forceClosed: false,
  }));

  return <EquipmentSimulatorClient initialCatalog={catalog} />;
}
