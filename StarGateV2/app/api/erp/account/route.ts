import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { getCurrentAccountResponse } from "@/lib/erp/current-account";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const account = await getCurrentAccountResponse(session.user.id);
    if (!account) {
      return NextResponse.json(
        { error: "계정을 찾을 수 없습니다." },
        { status: 404 },
      );
    }
    return NextResponse.json(account);
  } catch (error) {
    console.error("[account] GET failed", error);
    return NextResponse.json(
      { error: "계정 정보를 불러올 수 없습니다." },
      { status: 500 },
    );
  }
}
