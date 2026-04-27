import type { AgentCharacter, Character } from "@/types/character";

import { listPublicCharactersByType } from "@/lib/db/characters";

import type { AgentForView } from "./PlayerClient";

import PlayerClient from "./PlayerClient";

export const revalidate = 300;

/**
 * DB에서 공개 에이전트를 조회. 실패 시 빈 배열 반환.
 *
 * Phase 1 후 sheet → lore + play. CharacterSheetData 는 두 sub-document 의 합집합 형태로
 * 클라이언트에 전달.
 */
async function getAgents(): Promise<AgentForView[]> {
  const dbResult = await listPublicCharactersByType("AGENT").catch(
    () => [] as Character[],
  );
  const dbAgents = dbResult.filter(
    (c): c is AgentCharacter => c.type === "AGENT",
  );

  return dbAgents
    // 마이그레이션 미완료 도큐먼트(legacy `sheet` 단일 구조)는 lore/play 가 없을 수 있다.
    // 공개 사이트는 보수적으로 둘 다 존재하는 도큐먼트만 노출.
    .filter((c) => c.lore && c.play)
    .map((c) => ({
      id: c._id?.toString() ?? c.codename,
      codename: c.codename,
      role: c.role,
      previewImage: c.previewImage,
      pixelCharacterImage: c.pixelCharacterImage ?? "",
      warningVideo: c.warningVideo,
      sheet: {
        // lore 영역
        codename: c.codename,
        name: c.lore.name,
        mainImage: c.lore.mainImage,
        quote: c.lore.quote,
        gender: c.lore.gender,
        age: c.lore.age,
        height: c.lore.height,
        weight: c.lore.weight,
        appearance: c.lore.appearance,
        personality: c.lore.personality,
        background: c.lore.background,
        // play 영역
        className: c.play.className,
        hp: c.play.hp,
        san: c.play.san,
        def: c.play.def,
        atk: c.play.atk,
        abilityType: c.play.abilityType ?? "",
        credit: c.play.credit,
        weaponTraining: c.play.weaponTraining.join(", "),
        skillTraining: c.play.skillTraining.join(", "),
        equipment: c.play.equipment.map((eq) => ({
          name: eq.name,
          price: eq.price ?? "",
          damage: eq.damage ?? "",
          description: eq.description ?? "",
        })),
        abilities: c.play.abilities.map((ab) => ({
          code: ab.code ?? ab.slot,
          name: ab.name,
          description: ab.description ?? "",
          effect: ab.effect ?? "",
        })),
      },
    }));
}

export default async function PlayerPage() {
  const agents = await getAgents();
  return <PlayerClient agents={agents} />;
}
