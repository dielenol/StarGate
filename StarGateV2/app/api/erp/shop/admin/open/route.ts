import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import {
  getShopOpenState,
  setShopOpenMode,
  type ShopOpenMode,
  type ShopOpenState,
} from "@/lib/shop/open-state";

interface OpenStateBody {
  forceOpen?: unknown;
  mode?: unknown;
}

const OPEN_MODES = new Set<ShopOpenMode>(["auto", "open", "closed"]);

function serializeOpenState(state: ShopOpenState) {
  return {
    ...state,
    updatedAt: state.updatedAt?.toISOString() ?? null,
  };
}

function forbidUnlessGM(
  role: Parameters<typeof requireRole>[0],
): NextResponse | null {
  try {
    requireRole(role, "GM");
    return null;
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const forbidden = forbidUnlessGM(session.user.role);
  if (forbidden) return forbidden;

  try {
    const state = await getShopOpenState();
    return NextResponse.json(serializeOpenState(state));
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "편의점 영업 상태 조회 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const forbidden = forbidUnlessGM(session.user.role);
  if (forbidden) return forbidden;

  const body = (await request.json().catch(() => null)) as
    | OpenStateBody
    | null;
  const mode =
    typeof body?.mode === "string" && OPEN_MODES.has(body.mode as ShopOpenMode)
      ? (body.mode as ShopOpenMode)
      : typeof body?.forceOpen === "boolean"
        ? body.forceOpen
          ? "open"
          : "auto"
        : null;

  if (!mode) {
    return NextResponse.json(
      { error: "mode는 auto, open, closed 중 하나여야 합니다." },
      { status: 400 },
    );
  }

  try {
    const state = await setShopOpenMode({
      mode,
      updatedById: session.user.id,
      updatedByName: session.user.displayName,
    });
    return NextResponse.json(serializeOpenState(state));
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "편의점 영업 상태 변경 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
