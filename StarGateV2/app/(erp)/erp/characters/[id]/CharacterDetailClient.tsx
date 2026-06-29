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

interface Props {
  /** AGENT 전용. server (page.tsx) 가 NPC 를 personnel 로 redirect 하므로 여기엔 항상 AGENT 만 도달. */
  character: AgentCharacter;
  /**
   * 'admin' = V+ 모든 필드 편집, 'player' = 본인 캐릭터의 안전한 lore/play 자가편집 필드,
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
    <div data-pixel-font="ui">
      <PageHead
        breadcrumb={[
          { label: "CHARACTERS", href: "/erp/characters" },
          { label: character.codename },
        ]}
        title={character.lore.name || character.codename}
        right={
          canEdit || canDelete ? (
            <>
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
          ) : undefined
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
        institutionCode={character.institutionCode}
        department={character.department}
        gender={character.lore.gender}
        age={character.lore.age}
        height={character.lore.height}
        quote={character.lore.quote}
        playSheet={character.play}
        abilities={character.play.abilities}
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
    </div>
  );
}

/** AGENT 한정 — ABILITIES / EQUIPMENT 섹션. 콘텐츠 없는 박스는 통째로 생략.
 *  순서: ABILITIES 가 AGENT DETAILS 바로 다음에 오도록 EQUIPMENT 앞에 배치. */
function AgentSections({ character }: { character: AgentCharacter }) {
  const { play, lore } = character;

  const hasEquipment = play.equipment.length > 0;
  const hasProfile = Boolean(
    lore.appearance || lore.personality || lore.background,
  );

  return (
    <>
      {hasProfile ? (
        <Box>
          <PanelTitle right={<span className={styles.mono}>DOSSIER</span>}>
            CHARACTER PROFILE
          </PanelTitle>
          <div className={styles.itemList}>
            {lore.appearance ? (
              <div className={styles.itemCard}>
                <div className={styles.itemCard__head}>
                  <div className={styles.itemCard__name}>외모</div>
                </div>
                <div className={styles.itemCard__desc}>{lore.appearance}</div>
              </div>
            ) : null}
            {lore.personality ? (
              <div className={styles.itemCard}>
                <div className={styles.itemCard__head}>
                  <div className={styles.itemCard__name}>성격</div>
                </div>
                <div className={styles.itemCard__desc}>{lore.personality}</div>
              </div>
            ) : null}
            {lore.background ? (
              <div className={styles.itemCard}>
                <div className={styles.itemCard__head}>
                  <div className={styles.itemCard__name}>배경</div>
                </div>
                <div className={styles.itemCard__desc}>{lore.background}</div>
              </div>
            ) : null}
          </div>
        </Box>
      ) : null}

      {hasEquipment ? (
        <Box>
          <PanelTitle
            right={<span className={styles.mono}>{play.equipment.length}</span>}
          >
            EQUIPMENT
          </PanelTitle>
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
        </Box>
      ) : null}
    </>
  );
}
