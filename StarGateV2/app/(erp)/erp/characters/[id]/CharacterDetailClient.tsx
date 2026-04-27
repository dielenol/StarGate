"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import type { AgentCharacter } from "@/types/character";

import { characterKeys } from "@/hooks/queries/useCharactersQuery";

import type { CharacterEditMode } from "@/lib/auth/rbac";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import PageHead from "@/components/ui/PageHead/PageHead";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";
import Tag from "@/components/ui/Tag/Tag";

import ChangeLogsPanel, {
  type ChangeLogsPanelMode,
} from "./ChangeLogsPanel";
import CharacterEditForm from "./CharacterEditForm";
import PosterHero from "./PosterHero";

import styles from "./page.module.css";

const ABILITY_SLOT_ORDER = ["C1", "C2", "C3", "P", "A1", "A2", "A3"] as const;

interface Props {
  /** AGENT 전용. server (page.tsx) 가 NPC 를 personnel 로 redirect 하므로 여기엔 항상 AGENT 만 도달. */
  character: AgentCharacter;
  /**
   * 'admin' = V+ 모든 필드 편집, 'player' = 본인 캐릭터 lore 7필드만,
   * 'none' = 편집 불가 (편집 버튼/폼 모두 숨김).
   */
  editMode: CharacterEditMode;
  canDelete: boolean;
  /**
   * P8 변경 이력 패널 권한 모드.
   * - 'gm'    : GM (V+ 가 아닌 GM 한정) — 이력 + revert 버튼
   * - 'owner' : 본인 소유 캐릭터 readonly 이력
   * - 'none'  : 패널 미노출
   * 권한 결정은 서버(page.tsx)에서 한 번만 수행해 prop 으로 내려준다.
   */
  changeLogsMode: ChangeLogsPanelMode;
}

export default function CharacterDetailClient({
  character,
  editMode,
  canDelete,
  changeLogsMode,
}: Props) {
  const canEdit = editMode !== "none";
  const router = useRouter();
  const queryClient = useQueryClient();

  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const characterId = String(character._id);

  async function handleDelete() {
    const confirmed = window.confirm(
      `"${character.codename}" 캐릭터를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`,
    );
    if (!confirmed) return;

    setIsDeleting(true);
    setDeleteError(null);

    try {
      const res = await fetch(`/api/erp/characters/${characterId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        setDeleteError(data.error ?? "삭제에 실패했습니다.");
        setIsDeleting(false);
        return;
      }

      await queryClient.invalidateQueries({ queryKey: characterKeys.all });
      router.push("/erp/characters");
    } catch {
      setDeleteError("네트워크 오류가 발생했습니다.");
      setIsDeleting(false);
    }
  }

  if (isEditing && editMode !== "none") {
    return (
      <>
        <PageHead
          breadcrumb={[
            { label: "CHARACTERS", href: "/erp/characters" },
            {
              label: character.codename,
              href: `/erp/characters/${character._id}`,
            },
            { label: "EDIT" },
          ]}
          title={`${character.lore.name || character.codename} · 편집`}
        />
        <CharacterEditForm
          character={character}
          editMode={editMode}
          onCancel={() => setIsEditing(false)}
          onSaved={async () => {
            setIsEditing(false);
            await queryClient.invalidateQueries({ queryKey: characterKeys.all });
          }}
        />
      </>
    );
  }

  return (
    <>
      <PageHead
        breadcrumb={[
          { label: "CHARACTERS", href: "/erp/characters" },
          { label: character.codename },
        ]}
        title={character.lore.name || character.codename}
        right={
          <>
            <Tag tone="gold">{character.type}</Tag>
            <Tag tone={character.isPublic ? "success" : "danger"}>
              {character.isPublic ? "PUBLIC" : "PRIVATE"}
            </Tag>
            {canEdit ? (
              <Button
                type="button"
                variant="primary"
                onClick={() => setIsEditing(true)}
              >
                편집
              </Button>
            ) : null}
            {canDelete ? (
              <Button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? "삭제 중..." : "삭제"}
              </Button>
            ) : null}
          </>
        }
      />

      {deleteError ? <div className={styles.error}>{deleteError}</div> : null}

      <PosterHero
        posterImage={character.lore.posterImage}
        mainImage={character.lore.mainImage}
        codename={character.codename}
        name={character.lore.name}
        role={character.role}
        agentLevel={character.agentLevel}
        factionCode={character.factionCode}
        department={character.institutionCode ?? character.department}
        gender={character.lore.gender}
        age={character.lore.age}
        height={character.lore.height}
        quote={character.lore.quote}
        appearance={character.lore.appearance}
        personality={character.lore.personality}
        background={character.lore.background}
        playSheet={character.play}
      />

      <div className={styles.main}>
        <AgentSections character={character} />

        {/* P8 — 변경 이력 패널. GM 또는 본인일 때만 노출. */}
        {changeLogsMode !== "none" ? (
          <ChangeLogsPanel
            characterId={characterId}
            mode={changeLogsMode}
          />
        ) : null}
      </div>
    </>
  );
}

/** AGENT 한정 — EQUIPMENT / ABILITIES 섹션. (CLASS/WEIGHT/스탯 등은 PosterHero 우측 흡수.) */
function AgentSections({ character }: { character: AgentCharacter }) {
  const { play } = character;

  // 어빌리티는 7-슬롯 그리드 (C1/C2/C3/P/A1/A2/A3) 고정. 빈 슬롯도 라벨 칸으로 노출.
  const abilitiesBySlot = new Map(play.abilities.map((ab) => [ab.slot, ab]));

  return (
    <>
      <Box>
        <PanelTitle
          right={<span className={styles.mono}>{play.equipment.length}</span>}
        >
          EQUIPMENT
        </PanelTitle>
        {play.equipment.length === 0 ? (
          <div className={styles.empty}>장비 없음</div>
        ) : (
          <div className={styles.itemList}>
            {play.equipment.map((eq, i) => (
              <div key={i} className={styles.itemCard}>
                <div className={styles.itemCard__head}>
                  <div className={styles.itemCard__name}>{eq.name}</div>
                  {eq.damage ? <Tag tone="danger">DMG {eq.damage}</Tag> : null}
                </div>
                <div className={styles.itemCard__meta}>
                  <span className={styles.mono}>PRICE · {eq.price || "—"}</span>
                  {eq.ammo ? (
                    <span className={styles.mono}> · AMMO {eq.ammo}</span>
                  ) : null}
                  {eq.grip ? (
                    <span className={styles.mono}> · GRIP {eq.grip}</span>
                  ) : null}
                </div>
                {eq.description ? (
                  <div className={styles.itemCard__desc}>{eq.description}</div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Box>

      <Box>
        <PanelTitle right={<span className={styles.mono}>7 SLOTS</span>}>
          ABILITIES
        </PanelTitle>
        <div className={styles.itemList}>
          {ABILITY_SLOT_ORDER.map((slot) => {
            const ab = abilitiesBySlot.get(slot);
            const isFilled = ab && ab.name.trim().length > 0;
            return (
              <div key={slot} className={styles.itemCard}>
                <div className={styles.itemCard__head}>
                  <div className={styles.itemCard__name}>
                    <Tag tone="gold">{slot}</Tag>{" "}
                    {isFilled ? ab!.name : <span className={styles.mono}>EMPTY</span>}
                  </div>
                  {isFilled && ab!.code ? (
                    <Tag tone="default">{ab!.code}</Tag>
                  ) : null}
                </div>
                {isFilled && ab!.description ? (
                  <div className={styles.itemCard__desc}>{ab!.description}</div>
                ) : null}
                {isFilled && ab!.effect ? (
                  <div className={styles.itemCard__effect}>
                    <span className={styles.mono}>EFFECT · </span>
                    {ab!.effect}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </Box>
    </>
  );
}
