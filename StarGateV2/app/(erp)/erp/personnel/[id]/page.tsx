import { redirect, notFound } from "next/navigation";
import { ObjectId } from "mongodb";

import { canViewCharacter } from "@/lib/auth/access-policy";
import { getActiveSession } from "@/lib/auth/active-session";
import { hasRole, isCharacterOwner } from "@/lib/auth/rbac";
import { findCharacterById, listCharacters } from "@/lib/db/characters";
import { listSessionReports } from "@/lib/db/session-reports";
import { getUserClearance, filterCharacterByClearance } from "@/lib/personnel";

import DossierClient from "./DossierClient";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PersonnelDetailPage({ params }: PageProps) {
  const session = await getActiveSession();
  if (!session?.user) redirect("/login");

  const { id } = await params;
  if (!ObjectId.isValid(id)) notFound();

  const character = await findCharacterById(id);

  if (!character) notFound();
  if (!canViewCharacter(session.user.role, character)) notFound();

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
  const relationTargetCodes = new Set(
    (filtered.lore.relations ?? [])
      .map((relation) => relation.targetCodename)
      .filter((codename): codename is string => codename.trim().length > 0),
  );
  // 두 조회는 서로 독립 — 병렬 로드 (조건 미충족 시 fetch 자체를 스킵, 빈 배열이면
  // 아래 filter 체인이 그대로 빈 결과를 내 기존 분기와 동일).
  const [reportsForEvents, charactersForRelations] = await Promise.all([
    eventIds.size > 0
      ? listSessionReports().catch(() => [])
      : Promise.resolve([]),
    relationTargetCodes.size > 0
      ? listCharacters().catch(() => [])
      : Promise.resolve([]),
  ]);
  const relatedReports = reportsForEvents
    .filter((report) => eventIds.has(report.sessionId))
    .map((report) => ({
      id: report._id?.toString() ?? "",
      sessionId: report.sessionId,
      sessionTitle: report.sessionTitle,
      locationLabel: report.locationLabel,
      createdAt: report.createdAt,
    }))
    .filter((report) => report.id.length > 0);
  const serializedRelatedReports = JSON.parse(JSON.stringify(relatedReports));
  const relatedCharacters = charactersForRelations
    .filter((candidate) => {
      if (!relationTargetCodes.has(candidate.codename)) return false;
      return canEditDossier || candidate.isPublic !== false;
    })
    .map((candidate) => ({
      id: candidate._id?.toString() ?? "",
      codename: candidate.codename,
      displayName:
        candidate.lore.nickname || candidate.lore.name || candidate.codename,
      type: candidate.type,
      agentLevel: candidate.agentLevel,
    }))
    .filter((candidate) => candidate.id.length > 0);
  const serializedRelatedCharacters = JSON.parse(JSON.stringify(relatedCharacters));

  return (
    <DossierClient
      character={serialized}
      clearance={clearance}
      canEditDossier={canEditDossier}
      relatedReports={serializedRelatedReports}
      relatedCharacters={serializedRelatedCharacters}
    />
  );
}
