import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";

import { buildPricesResponse } from "../../stock/_data";
import StockAdminClient from "./StockAdminClient";

export const metadata = {
  title: "주식 운영 — Stargate ERP",
};

export default async function StockAdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasRole(session.user.role, "GM")) redirect("/erp");

  const initialPrices = await buildPricesResponse();

  return <StockAdminClient initialPrices={initialPrices} />;
}

