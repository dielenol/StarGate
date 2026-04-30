"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import type { AgentCharacter } from "@/types/character";

import { characterChangeLogsKeys } from "@/hooks/queries/useCharacterChangeLogs";
import {
  characterKeys,
  personnelKeys,
} from "@/hooks/queries/useCharactersQuery";

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

const ABILITY_SLOT_ORDER = [
  "C1",
  "C2",
  "C3",
  "C4",
  "C5",
  "P",
  "A1",
  "A2",
  "A3",
  "A4",
  "A5",
] as const;

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
  /** GM 운영진 여부 — bulkUpdatedAt SYNC 메타 노출 등 GM 전용 패널 제어용. */
  isGM: boolean;
}

export default function CharacterDetailClient({
  character,
  editMode,
  canDelete,
  changeLogsMode,
  isGM,
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
            // characters / personnel 양쪽 무효화 — character lore 가 personnel dossier 에도
            // 노출되므로 한쪽만 invalidate 하면 다른 라우트에 stale 잔존.
            // change-logs 도 함께 — admin 편집은 audit row 가 즉시 추가되므로 같은 페이지의
            // ChangeLogsPanel 이 stale 60s 동안 새 row 를 못 보면 UX 회귀.
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: characterKeys.all }),
              queryClient.invalidateQueries({ queryKey: personnelKeys.all }),
              queryClient.invalidateQueries({ queryKey: characterChangeLogsKeys.all }),
            ]);
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

      {isGM && character.bulkUpdatedAt ? (
        <div
          className={styles.adminSync}
          title="GM 운영진 전용 — Claude/스크립트로 통짜 데이터를 덮어쓴 시점. 사용자 폼 편집은 반영되지 않음."
        >
          <span className={styles.adminSync__label}>SYNC · GM</span>
          <span className={styles.adminSync__value}>
            통짜 데이터 동기화 ·{" "}
            {new Date(character.bulkUpdatedAt).toLocaleString("ko-KR", {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      ) : null}

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

  // 어빌리티는 11-슬롯 시스템 (C1~C5/P/A1~A5). 채워진 슬롯만 노출, 전체 비면 빈 메시지.
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

      {(() => {
        // 빈 슬롯은 노출하지 않음. 채워진 슬롯만 ABILITY_SLOT_ORDER 순서로 정렬해 렌더.
        // 채워진 슬롯이 0이면 EQUIPMENT 패턴과 일관되게 "어빌리티 없음" 안내.
        const filled = ABILITY_SLOT_ORDER.flatMap((slot) => {
          const ab = abilitiesBySlot.get(slot);
          return ab && ab.name.trim().length > 0 ? [{ slot, ab }] : [];
        });

        return (
          <Box>
            <PanelTitle
              right={<span className={styles.mono}>{filled.length}</span>}
            >
              ABILITIES
            </PanelTitle>
            {filled.length === 0 ? (
              <div className={styles.empty}>어빌리티 없음</div>
            ) : (
              <div className={styles.itemList}>
                {filled.map(({ slot, ab }) => (
                  <div key={slot} className={styles.itemCard}>
                    <div className={styles.itemCard__head}>
                      <div className={styles.itemCard__name}>
                        <Tag tone="gold">{slot}</Tag> {ab.name}
                      </div>
                      {ab.code ? <Tag tone="default">{ab.code}</Tag> : null}
                    </div>
                    {ab.description ? (
                      <div className={styles.itemCard__desc}>{ab.description}</div>
                    ) : null}
                    {ab.effect ? (
                      <div className={styles.itemCard__effect}>
                        <span className={styles.mono}>EFFECT · </span>
                        {ab.effect}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </Box>
        );
      })()}
    </>
  );
}
