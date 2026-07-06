import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";

import { buildMarketWireResponse, buildPricesResponse } from "../../stock/_data";
import { buildStockAdminHoldingsResponse } from "./_data";
import StockAdminClient from "./StockAdminClient";

export const metadata = {
  title: "주식 운영 — Stargate ERP",
};

export default async function StockAdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasRole(session.user.role, "GM")) redirect("/erp");

  const [initialPrices, initialMarketWire, initialHoldings] = await Promise.all([
    buildPricesResponse(),
    buildMarketWireResponse(14, 20).catch(() => ({
      items: [],
      days: 14,
      limit: 20,
    })),
    buildStockAdminHoldingsResponse().catch(() => ({
      rows: [],
      generatedAt: new Date().toISOString(),
    })),
  ]);

  return (
    <StockAdminClient
      initialPrices={initialPrices}
      initialMarketWire={initialMarketWire}
      initialHoldings={initialHoldings}
    />
  );
}
