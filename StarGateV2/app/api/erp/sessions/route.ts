import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { findSessionsByMonth } from "@/lib/db/registrar-read";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const yearParam = searchParams.get("year");
  const monthParam = searchParams.get("month");
  const guildId = searchParams.get("guildId");

  if (!yearParam || !monthParam || !guildId) {
    return NextResponse.json(
      { error: "year, month, guildId 파라미터가 필요합니다." },
      { status: 400 },
    );
  }

  const year = parseInt(yearParam, 10);
  const month = parseInt(monthParam, 10);

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    return NextResponse.json(
      { error: "유효하지 않은 year 또는 month 값입니다." },
      { status: 400 },
    );
  }

  try {
    const sessions = await findSessionsByMonth(guildId, year, month);

    const serialized = sessions.map((s) => ({
      ...s,
      _id: s._id?.toString() ?? "",
      targetDateTime: new Date(s.targetDateTime).toISOString(),
      closeDateTime: new Date(s.closeDateTime).toISOString(),
      createdAt: new Date(s.createdAt).toISOString(),
      updatedAt: new Date(s.updatedAt).toISOString(),
    }));

    return NextResponse.json({ sessions: serialized });
  } catch {
    return NextResponse.json(
      { error: "세션 데이터를 불러오는데 실패했습니다." },
      { status: 500 },
    );
  }
}
