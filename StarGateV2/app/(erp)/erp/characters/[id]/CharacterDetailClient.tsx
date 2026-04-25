"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import type {
  AgentCharacter,
  Character,
  NpcCharacter,
} from "@/types/character";

import { characterKeys } from "@/hooks/queries/useCharactersQuery";

import { getDepartmentLabel } from "@/lib/org-structure";
import type { CharacterEditMode } from "@/lib/auth/rbac";

import Bar from "@/components/ui/Bar/Bar";
import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import PageHead from "@/components/ui/PageHead/PageHead";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";
import Seal from "@/components/ui/Seal/Seal";
import Stack from "@/components/ui/Stack/Stack";
import Tag from "@/components/ui/Tag/Tag";

import ChangeLogsPanel, {
  type ChangeLogsPanelMode,
} from "./ChangeLogsPanel";
import CharacterEditForm from "./CharacterEditForm";
import PosterHero from "./PosterHero";

import styles from "./page.module.css";

interface Props {
  character: Character;
  /**
   * 'admin' = V+ 모든 필드 편집, 'player' = 본인 캐릭터 서사 7필드만,
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

function getInitial(c: Character): string {
  const source = c.sheet.name || c.codename;
  return source.charAt(0).toUpperCase() || "?";
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
          title={`${character.sheet.name || character.codename} · 편집`}
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

  const departmentLabel = character.department
    ? getDepartmentLabel(character.department)
    : null;

  return (
    <>
      <PageHead
        breadcrumb={[
          { label: "CHARACTERS", href: "/erp/characters" },
          { label: character.codename },
        ]}
        title={character.sheet.name || character.codename}
        right={
          <>
            <Tag tone={character.type === "AGENT" ? "gold" : "default"}>
              {character.type}
            </Tag>
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
        posterImage={character.sheet.posterImage}
        mainImage={character.sheet.mainImage}
        codename={character.codename}
        name={character.sheet.name}
        type={character.type}
        role={character.role}
        agentLevel={character.agentLevel}
      />

      <div className={styles.layout}>
        {/* ── 좌측 사이드: 초상화, 신상, VITALS (AGENT) ── */}
        <div className={styles.side}>
          <Box>
            <div className={styles.sideHeader}>
              {character.sheet.mainImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={character.sheet.mainImage}
                  alt={character.codename}
                  className={styles.sideHeader__image}
                />
              ) : (
                <Seal size="lg" className={styles.sideHeader__seal}>
                  {getInitial(character)}
                </Seal>
              )}
              <div className={styles.sideHeader__code}>
                {character.codename}
              </div>
              <h2 className={styles.sideHeader__name}>
                {character.sheet.name || character.codename}
              </h2>
              {character.role ? (
                <div className={styles.sideHeader__role}>
                  {[character.role, departmentLabel]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              ) : null}
            </div>

            {character.sheet.quote ? (
              <div className={styles.quote}>
                &ldquo;{character.sheet.quote}&rdquo;
              </div>
            ) : null}

            <dl className={styles.kv}>
              {character.sheet.gender ? (
                <div className={styles.kv__row}>
                  <dt>GENDER</dt>
                  <dd>{character.sheet.gender}</dd>
                </div>
              ) : null}
              {character.sheet.age ? (
                <div className={styles.kv__row}>
                  <dt>AGE</dt>
                  <dd className={styles.mono}>{character.sheet.age}</dd>
                </div>
              ) : null}
              {character.sheet.height ? (
                <div className={styles.kv__row}>
                  <dt>HEIGHT</dt>
                  <dd className={styles.mono}>{character.sheet.height}</dd>
                </div>
              ) : null}
              {character.ownerId ? (
                <div className={styles.kv__row}>
                  <dt>OWNER</dt>
                  <dd className={styles.mono}>{character.ownerId}</dd>
                </div>
              ) : null}
            </dl>
          </Box>

          {character.type === "AGENT" ? (
            <AgentVitals character={character} />
          ) : null}
        </div>

        {/* ── 메인 ── */}
        <div className={styles.main}>
          <Box>
            <PanelTitle>CHARACTER PROFILE</PanelTitle>
            <dl className={styles.prof}>
              <div className={styles.prof__row}>
                <dt>외모</dt>
                <dd>{character.sheet.appearance || "—"}</dd>
              </div>
              <div className={styles.prof__row}>
                <dt>성격</dt>
                <dd>{character.sheet.personality || "—"}</dd>
              </div>
              <div className={styles.prof__row}>
                <dt>배경</dt>
                <dd>{character.sheet.background || "—"}</dd>
              </div>
            </dl>
          </Box>

          {character.type === "AGENT" ? (
            <AgentSections character={character} />
          ) : (
            <NpcSections character={character} />
          )}

          {/* P8 — 변경 이력 패널. GM 또는 본인일 때만 노출. */}
          {changeLogsMode !== "none" ? (
            <ChangeLogsPanel
              characterId={characterId}
              mode={changeLogsMode}
            />
          ) : null}
        </div>
      </div>
    </>
  );
}

function AgentVitals({ character }: { character: AgentCharacter }) {
  const { sheet } = character;

  return (
    <Box>
      <PanelTitle right={<span className={styles.mono}>STATUS</span>}>
        VITALS
      </PanelTitle>
      <Stack gap={10}>
        <VitalRow label="HP" value={sheet.hp} tone="gold" />
        <VitalRow
          label="SAN"
          value={sheet.san}
          tone={sheet.san < 30 ? "danger" : "info"}
        />
        <VitalRow label="DEF" value={sheet.def} tone="gold" />
        <VitalRow label="ATK" value={sheet.atk} tone="gold" />
      </Stack>
    </Box>
  );
}

function VitalRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "gold" | "info" | "danger";
}) {
  return (
    <div>
      <div className={styles.vital__head}>
        <span className={styles.vital__label}>{label}</span>
        <span className={styles.vital__value}>{value}</span>
      </div>
      <Bar value={value} tone={tone} />
    </div>
  );
}

function AgentSections({ character }: { character: AgentCharacter }) {
  const { sheet } = character;

  return (
    <>
      <Box>
        <PanelTitle right={<span className={styles.mono}>SHEET</span>}>
          AGENT DETAILS
        </PanelTitle>
        <dl className={styles.prof}>
          {sheet.className ? (
            <div className={styles.prof__row}>
              <dt>CLASS</dt>
              <dd>{sheet.className}</dd>
            </div>
          ) : null}
          {sheet.weight ? (
            <div className={styles.prof__row}>
              <dt>WEIGHT</dt>
              <dd>{sheet.weight}</dd>
            </div>
          ) : null}
          {sheet.abilityType ? (
            <div className={styles.prof__row}>
              <dt>ABILITY TYPE</dt>
              <dd>{sheet.abilityType}</dd>
            </div>
          ) : null}
          {sheet.credit !== "" && sheet.credit !== undefined ? (
            <div className={styles.prof__row}>
              <dt>CREDIT</dt>
              <dd className={styles.mono}>{sheet.credit}</dd>
            </div>
          ) : null}
          {sheet.weaponTraining ? (
            <div className={styles.prof__row}>
              <dt>WEAPON</dt>
              <dd>{sheet.weaponTraining}</dd>
            </div>
          ) : null}
          {sheet.skillTraining ? (
            <div className={styles.prof__row}>
              <dt>SKILL</dt>
              <dd>{sheet.skillTraining}</dd>
            </div>
          ) : null}
        </dl>
      </Box>

      <Box>
        <PanelTitle
          right={<span className={styles.mono}>{sheet.equipment.length}</span>}
        >
          EQUIPMENT
        </PanelTitle>
        {sheet.equipment.length === 0 ? (
          <div className={styles.empty}>장비 없음</div>
        ) : (
          <div className={styles.itemList}>
            {sheet.equipment.map((eq, i) => (
              <div key={i} className={styles.itemCard}>
                <div className={styles.itemCard__head}>
                  <div className={styles.itemCard__name}>{eq.name}</div>
                  {eq.damage ? <Tag tone="danger">DMG {eq.damage}</Tag> : null}
                </div>
                <div className={styles.itemCard__meta}>
                  <span className={styles.mono}>PRICE · {eq.price || "—"}</span>
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
        <PanelTitle
          right={<span className={styles.mono}>{sheet.abilities.length}</span>}
        >
          ABILITIES
        </PanelTitle>
        {sheet.abilities.length === 0 ? (
          <div className={styles.empty}>어빌리티 없음</div>
        ) : (
          <div className={styles.itemList}>
            {sheet.abilities.map((ab, i) => (
              <div key={i} className={styles.itemCard}>
                <div className={styles.itemCard__head}>
                  <div className={styles.itemCard__name}>{ab.name}</div>
                  {ab.code ? <Tag tone="gold">{ab.code}</Tag> : null}
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
    </>
  );
}

function NpcSections({ character }: { character: NpcCharacter }) {
  const { sheet } = character;

  return (
    <Box>
      <PanelTitle right={<span className={styles.mono}>NPC</span>}>
        NPC DETAILS
      </PanelTitle>
      <dl className={styles.prof}>
        {sheet.nameEn ? (
          <div className={styles.prof__row}>
            <dt>NAME (EN)</dt>
            <dd className={styles.mono}>{sheet.nameEn}</dd>
          </div>
        ) : null}
        {sheet.roleDetail ? (
          <div className={styles.prof__row}>
            <dt>ROLE DETAIL</dt>
            <dd>{sheet.roleDetail}</dd>
          </div>
        ) : null}
        {sheet.notes ? (
          <div className={styles.prof__row}>
            <dt>NOTES</dt>
            <dd>{sheet.notes}</dd>
          </div>
        ) : null}
      </dl>
    </Box>
  );
}
