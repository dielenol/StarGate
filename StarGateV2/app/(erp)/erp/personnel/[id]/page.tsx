import { redirect, notFound } from "next/navigation";
import { ObjectId } from "mongodb";

import { auth } from "@/lib/auth/config";
import { hasRole, isCharacterOwner } from "@/lib/auth/rbac";
import { findCharacterById } from "@/lib/db/characters";
import { listSessionReports } from "@/lib/db/session-reports";
import { getUserClearance, filterCharacterByClearance } from "@/lib/personnel";

import DossierClient from "./DossierClient";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PersonnelDetailPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;
  if (!ObjectId.isValid(id)) notFound();

  const character = await findCharacterById(id);

  if (!character) notFound();

  // 본인 보유 캐릭터는 자동 GM clearance — 자기 캐릭터의 전체 정보(스탯/어빌리티/메타)는
  // 권한 등급과 무관하게 볼 수 있어야 한다 (예: J 등급 플레이어가 본인 캐릭터 스탯 확인 가능).
  const isOwnCharacter = isCharacterOwner(session.user.id, character);
  const clearance = isOwnCharacter
    ? "GM"
    : getUserClearance(session.user.role);
  const canEditDossier = hasRole(session.user.role, "GM");

  const filtered = filterCharacterByClearance(character, clearance);
  const serialized = JSON.parse(JSON.stringify(filtered));
  const eventIds = new Set(filtered.lore.appearsInEvents ?? []);
  const relatedReports = eventIds.size > 0
    ? (await listSessionReports().catch(() => []))
        .filter((report) => eventIds.has(report.sessionId))
        .map((report) => ({
          id: report._id?.toString() ?? "",
          sessionId: report.sessionId,
          sessionTitle: report.sessionTitle,
          locationLabel: report.locationLabel,
          createdAt: report.createdAt,
        }))
        .filter((report) => report.id.length > 0)
    : [];
  const serializedRelatedReports = JSON.parse(JSON.stringify(relatedReports));

  return (
    <DossierClient
      character={serialized}
      clearance={clearance}
      canEditDossier={canEditDossier}
      relatedReports={serializedRelatedReports}
    />
  );
}
