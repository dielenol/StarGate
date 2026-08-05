import { redirect, notFound } from "next/navigation";
import { ObjectId } from "mongodb";

import { canViewCharacter } from "@/lib/auth/access-policy";
import { getActiveSession } from "@/lib/auth/active-session";
import { hasRole } from "@/lib/auth/rbac";
import {
  findCharacterById,
  findCharactersByCodenames,
} from "@/lib/db/characters";
import {
  getUserClearance,
  getEffectivePersonnelClearance,
  filterCharacterByClearance,
  maskedDisplayName,
} from "@/lib/personnel";
import { findPersonnelRelatedReports } from "@/lib/personnel-related-reports";

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
  const clearance = getEffectivePersonnelClearance(
    session.user.id,
    session.user.role,
    character,
  );
  // 본인 승격은 "자기 캐릭터" 데이터에만 적용 — 관계 패널의 제3자 이름은 뷰어 실등급으로 게이트.
  const viewerClearance = getUserClearance(session.user.role);
  const canEditDossier = hasRole(session.user.role, "GM");

  const filtered = filterCharacterByClearance(character, clearance);
  const serialized = JSON.parse(JSON.stringify(filtered));
  const relationTargetCodes = new Set(
    (filtered.lore.relations ?? [])
      .map((relation) => relation.targetCodename)
      .filter((codename): codename is string => codename.trim().length > 0),
  );
  // 두 조회는 서로 독립 — 병렬 로드 (조건 미충족 시 fetch 자체를 스킵).
  // 전체 컬렉션 로드 + JS 필터 대신 sessionId / codename `$in` 조회로 좁힌다
  // (정렬은 각 함수가 기존 목록 함수와 동일하게 유지 — 표시 순서 보존).
  const [reportsForEvents, charactersForRelations] = await Promise.all([
    // SSR은 보고서 저장소 장애 시 Dossier 본문을 계속 보여주되, polling API는
    // 오류를 전파해 TanStack Query가 마지막 정상 링크 데이터를 보존하게 한다.
    findPersonnelRelatedReports(filtered.lore, filtered.codename).catch(
      () => [],
    ),
    relationTargetCodes.size > 0
      ? findCharactersByCodenames(Array.from(relationTargetCodes)).catch(
          () => [],
        )
      : Promise.resolve([]),
  ]);
  const serializedRelatedReports = JSON.parse(JSON.stringify(reportsForEvents));
  const relatedCharacters = charactersForRelations
    .filter((candidate) => canEditDossier || candidate.isPublic !== false)
    .map((candidate) => ({
      id: candidate._id?.toString() ?? "",
      codename: candidate.codename,
      // 실명은 뷰어 clearance 게이트를 통과할 때만 노출 (마스킹 시 codename 폴백).
      displayName: maskedDisplayName(candidate, viewerClearance),
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
