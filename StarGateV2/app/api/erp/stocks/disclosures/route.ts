import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { listStockDisclosures } from "@/lib/db/stock-market";
import { serializeStockDisclosure } from "@/lib/stocks/disclosures";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const rows = await listStockDisclosures({ now, limit: 100 });
    return NextResponse.json(
      {
        items: rows.map((row) =>
          serializeStockDisclosure(row, { admin: false }),
        ),
        generatedAt: now.toISOString(),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("[stocks/disclosures] read failed:", error);
    return NextResponse.json(
      { error: "주식 공시를 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
