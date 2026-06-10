import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import { setFactionFavorability } from "@/lib/db/faction-favorability";

const EDITABLE_FACTION_CODES = new Set([
  "COUNCIL",
  "MILITARY",
  "CIVIL",
  "WHITE_ROSE",
  "SPACE_ZERO",
  "NOVUS_ORDO",
  "SECRETARIAT",
  "MANUS",
]);

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requireRole(session.user.role, "GM");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { code?: unknown; favorability?: unknown };
  try {
    body = (await request.json()) as {
      code?: unknown;
      favorability?: unknown;
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const code =
    typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  const favorability = body.favorability;

  if (!EDITABLE_FACTION_CODES.has(code)) {
    return NextResponse.json(
      { error: `unknown faction code: ${code || "(empty)"}` },
      { status: 400 },
    );
  }

  if (
    typeof favorability !== "number" ||
    !Number.isInteger(favorability) ||
    favorability < 0 ||
    favorability > 10
  ) {
    return NextResponse.json(
      { error: "favorability must be an integer from 0 to 10" },
      { status: 400 },
    );
  }

  try {
    const updated = await setFactionFavorability({
      code,
      value: favorability,
      updatedById: session.user.id,
      updatedByName: session.user.displayName,
    });

    return NextResponse.json({
      code: updated.code,
      favorability: updated.value,
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "우호도 저장에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
