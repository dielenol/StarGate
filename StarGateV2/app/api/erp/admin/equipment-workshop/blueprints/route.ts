import { NextResponse } from "next/server";

import { getActiveSession } from "@/lib/auth/active-session";
import { hasRole } from "@/lib/auth/rbac";
import {
  archiveEquipmentWorkshopBlueprint,
  createEquipmentWorkshopBlueprint,
  listEquipmentWorkshopBlueprints,
  serializeEquipmentWorkshopBlueprint,
  updateEquipmentWorkshopBlueprint,
} from "@/lib/db/equipment-workshop-blueprints";
import { parseEquipmentWorkshopBlueprint } from "@/lib/equipment-shop/workshop-blueprint";
import { scheduleGmAdminAudit } from "@/lib/notifications/gm-admin-audit";

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

async function requireGm() {
  const session = await getActiveSession();
  if (!session?.user) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    } as const;
  }
  if (!hasRole(session.user.role, "GM")) {
    return {
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    } as const;
  }
  return { user: session.user } as const;
}

export async function GET(request: Request) {
  const auth = await requireGm();
  if ("response" in auth) return auth.response;
  const includeArchived =
    new URL(request.url).searchParams.get("includeArchived") === "true";
  const blueprints = await listEquipmentWorkshopBlueprints({ includeArchived });
  return NextResponse.json(
    { blueprints: blueprints.map(serializeEquipmentWorkshopBlueprint) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: Request) {
  const auth = await requireGm();
  if ("response" in auth) return auth.response;
  const validation = parseEquipmentWorkshopBlueprint(
    await request.json().catch(() => null),
  );
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }
  try {
    const blueprint = await createEquipmentWorkshopBlueprint({
      blueprint: validation.input,
      actorId: auth.user.id,
      actorName: auth.user.displayName,
    });
    scheduleGmAdminAudit({
      action: "공방 설계안 생성",
      actor: {
        id: auth.user.id,
        displayName: auth.user.displayName,
        role: auth.user.role,
      },
      summary: `${blueprint.displayName} · v${blueprint.version}`,
      target: blueprint.slug,
      timestamp: new Date(),
    });
    return NextResponse.json(
      { blueprint: serializeEquipmentWorkshopBlueprint(blueprint) },
      { status: 201 },
    );
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return NextResponse.json(
        { error: "이미 사용 중인 설계안 slug입니다.", code: "BLUEPRINT_SLUG_EXISTS" },
        { status: 409 },
      );
    }
    throw error;
  }
}

export async function PUT(request: Request) {
  const auth = await requireGm();
  if ("response" in auth) return auth.response;
  const body = (await request.json().catch(() => null)) as
    | { id?: unknown; expectedVersion?: unknown; blueprint?: unknown }
    | null;
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  const expectedVersion = body?.expectedVersion;
  if (!id || !Number.isInteger(expectedVersion) || Number(expectedVersion) < 1) {
    return NextResponse.json(
      { error: "설계안 ID와 현재 버전이 필요합니다." },
      { status: 400 },
    );
  }
  const validation = parseEquipmentWorkshopBlueprint(body?.blueprint);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }
  try {
    const blueprint = await updateEquipmentWorkshopBlueprint({
      id,
      expectedVersion: Number(expectedVersion),
      blueprint: validation.input,
      actorId: auth.user.id,
      actorName: auth.user.displayName,
    });
    if (!blueprint) {
      return NextResponse.json(
        { error: "다른 운영자가 설계안을 먼저 수정했거나 보관했습니다.", code: "BLUEPRINT_CHANGED" },
        { status: 409 },
      );
    }
    scheduleGmAdminAudit({
      action: "공방 설계안 수정",
      actor: {
        id: auth.user.id,
        displayName: auth.user.displayName,
        role: auth.user.role,
      },
      summary: `${blueprint.displayName} · v${blueprint.version}`,
      target: blueprint.slug,
      timestamp: new Date(),
    });
    return NextResponse.json({
      blueprint: serializeEquipmentWorkshopBlueprint(blueprint),
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return NextResponse.json(
        { error: "이미 사용 중인 설계안 slug입니다.", code: "BLUEPRINT_SLUG_EXISTS" },
        { status: 409 },
      );
    }
    throw error;
  }
}

export async function DELETE(request: Request) {
  const auth = await requireGm();
  if ("response" in auth) return auth.response;
  const body = (await request.json().catch(() => null)) as
    | { id?: unknown; expectedVersion?: unknown }
    | null;
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  const expectedVersion = body?.expectedVersion;
  if (!id || !Number.isInteger(expectedVersion) || Number(expectedVersion) < 1) {
    return NextResponse.json(
      { error: "설계안 ID와 현재 버전이 필요합니다." },
      { status: 400 },
    );
  }
  const blueprint = await archiveEquipmentWorkshopBlueprint({
    id,
    expectedVersion: Number(expectedVersion),
    actorId: auth.user.id,
    actorName: auth.user.displayName,
  });
  if (!blueprint) {
    return NextResponse.json(
      { error: "다른 운영자가 설계안을 먼저 수정했거나 보관했습니다.", code: "BLUEPRINT_CHANGED" },
      { status: 409 },
    );
  }
  scheduleGmAdminAudit({
    action: "공방 설계안 보관",
    actor: {
      id: auth.user.id,
      displayName: auth.user.displayName,
      role: auth.user.role,
    },
    summary: `${blueprint.displayName} · v${blueprint.version}`,
    target: blueprint.slug,
    timestamp: new Date(),
  });
  return NextResponse.json({
    blueprint: serializeEquipmentWorkshopBlueprint(blueprint),
  });
}
