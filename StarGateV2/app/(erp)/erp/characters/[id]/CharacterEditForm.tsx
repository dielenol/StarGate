"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import type {
  Ability,
  AbilitySlot,
  AgentCharacter,
  CharacterTier,
  Equipment,
} from "@/types/character";
import {
  CHARACTER_TIERS,
  FACTIONS,
  INSTITUTIONS,
} from "@/types/character";

import {
  characterEditQuotaKeys,
  useCharacterEditQuota,
} from "@/hooks/queries/useCharacterEditQuota";

import DiffPreviewModal, {
  type DiffEntry,
} from "./DiffPreviewModal";

import styles from "./CharacterEditForm.module.css";

/**
 * 'admin' = V+ 모든 필드 편집 가능, 'player' = 본인 캐릭터 lore 8필드만 편집 가능.
 * 'none' 은 폼 진입 자체가 막혀 여기서는 다루지 않음.
 */
type EditMode = "admin" | "player";

interface Props {
  /** AGENT 전용 — page.tsx 가 NPC 를 redirect 하므로 NPC 분기 불필요. */
  character: AgentCharacter;
  editMode: EditMode;
  onCancel: () => void;
  onSaved: () => void;
}

const ABILITY_SLOTS: readonly AbilitySlot[] = [
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

/**
 * 플레이어 자가편집에서 허용되는 lore 필드 (sub-document key 명, prefix 없음).
 *
 * shared-db `ALLOWED_LORE_FIELDS_PLAYER` 와 sync 필수 (`lore.X` prefix 제거형).
 * shared-db 직접 import 시 mongodb transitive 의존이 client 번들에 누수되어 빌드 실패 →
 * 클라 측 hardcoded 유지.
 */
const PLAYER_EDITABLE_LORE_FIELDS = new Set<string>([
  "quote",
  "appearance",
  "personality",
  "background",
  "gender",
  "age",
  "height",
  "weight",
]);

function isPlayerEditableLore(fieldKey: string): boolean {
  return PLAYER_EDITABLE_LORE_FIELDS.has(fieldKey);
}

/* ── client-side diff util ── */

function getPathValue(source: unknown, path: string): unknown {
  if (source === null || source === undefined) return undefined;
  const segments = path.split(".");
  let cursor: unknown = source;
  for (const seg of segments) {
    if (cursor === null || cursor === undefined) return undefined;
    if (typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[seg];
  }
  return cursor;
}

function isSemanticallyEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return a === b;
  if (a === null || b === null) return a === b;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function buildLocalDiff(
  before: unknown,
  after: unknown,
  fields: Iterable<string>,
): { field: string; before: unknown; after: unknown }[] {
  const entries: { field: string; before: unknown; after: unknown }[] = [];
  for (const field of fields) {
    const beforeVal = getPathValue(before, field);
    const afterVal = getPathValue(after, field);
    if (!isSemanticallyEqual(beforeVal, afterVal)) {
      entries.push({ field, before: beforeVal, after: afterVal });
    }
  }
  return entries;
}

/* ── 모드별 diff 비교 대상 dot path 세트 ──
   - player: lore 8필드
   - admin: root 메타 + lore 전 + play 전 — shared-db 화이트리스트 미러 */
const PLAYER_DIFF_FIELDS: ReadonlyArray<string> = [
  "lore.quote",
  "lore.appearance",
  "lore.personality",
  "lore.background",
  "lore.gender",
  "lore.age",
  "lore.height",
  "lore.weight",
];

const ADMIN_DIFF_FIELDS: ReadonlyArray<string> = [
  "codename",
  "tier",
  "role",
  "isPublic",
  "previewImage",
  "ownerId",
  "department",
  "factionCode",
  "institutionCode",
  // lore
  "lore.name",
  "lore.nameNative",
  "lore.nickname",
  "lore.gender",
  "lore.age",
  "lore.height",
  "lore.weight",
  "lore.appearance",
  "lore.personality",
  "lore.background",
  "lore.quote",
  "lore.mainImage",
  "lore.posterImage",
  // play
  "play.className",
  "play.hp",
  "play.hpDelta",
  "play.san",
  "play.sanDelta",
  "play.def",
  "play.defDelta",
  "play.atk",
  "play.atkDelta",
  "play.abilityType",
  "play.weaponTraining",
  "play.skillTraining",
  "play.credit",
  "play.equipment",
  "play.abilities",
];

/* ── Default factories ── */

function emptyEquipment(): Equipment {
  return { name: "", price: "", damage: "", ammo: "", grip: "", description: "" };
}

/** 11-슬롯 ability 초기화. 기존 ability 가 슬롯에 없으면 빈 슬롯으로 채움. */
function initAbilities(existing: Ability[]): Ability[] {
  const map = new Map(existing.map((a) => [a.slot, a]));
  return ABILITY_SLOTS.map(
    (slot) => map.get(slot) ?? { slot, name: "" },
  );
}

/** 콤마/공백 구분 string ↔ string[] 변환 */
function tagsToString(arr: string[] | undefined): string {
  return (arr ?? []).join(", ");
}
function stringToTags(s: string): string[] {
  return s
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

function emptyToUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export default function CharacterEditForm({
  character,
  editMode,
  onCancel,
  onSaved,
}: Props) {
  const characterId = String(character._id);
  const isPlayer = editMode === "player";

  const queryClient = useQueryClient();

  /** 편집 쿼터 — player 한정 폴링 */
  const { data: quotaData } = useCharacterEditQuota(characterId, isPlayer);

  function isLocked(loreFieldKey: string): boolean {
    // admin 모드 전체 허용 / player 는 lore 8필드만 허용
    return isPlayer && !isPlayerEditableLore(loreFieldKey);
  }

  /* ── Root meta ── */
  const [codename, setCodename] = useState(character.codename);
  const [role, setRole] = useState(character.role);
  const [previewImage, setPreviewImage] = useState(character.previewImage);
  const [isPublic, setIsPublic] = useState(character.isPublic);
  const [ownerId, setOwnerId] = useState(character.ownerId ?? "");
  const [tier, setTier] = useState<CharacterTier>(character.tier ?? "MAIN");
  const [department, setDepartment] = useState<string>(
    character.department ?? "UNASSIGNED",
  );
  const [factionCode, setFactionCode] = useState(character.factionCode ?? "");
  const [institutionCode, setInstitutionCode] = useState(
    character.institutionCode ?? "",
  );

  /* ── Lore ── */
  const lore = character.lore;
  const [name, setName] = useState(lore.name);
  const [nameNative, setNameNative] = useState(lore.nameNative ?? "");
  const [nickname, setNickname] = useState(lore.nickname ?? "");
  const [mainImage, setMainImage] = useState(lore.mainImage);
  const [posterImage, setPosterImage] = useState(lore.posterImage ?? "");
  const [quote, setQuote] = useState(lore.quote);
  const [gender, setGender] = useState(lore.gender);
  const [age, setAge] = useState(lore.age);
  const [height, setHeight] = useState(lore.height);
  const [weight, setWeight] = useState(lore.weight);
  const [appearance, setAppearance] = useState(lore.appearance);
  const [personality, setPersonality] = useState(lore.personality);
  const [background, setBackground] = useState(lore.background);

  /* ── Play (admin 전용 입력) ── */
  const play = character.play;
  const [className, setClassName] = useState(play.className);
  const [hp, setHp] = useState(play.hp);
  const [hpDelta, setHpDelta] = useState(play.hpDelta);
  const [san, setSan] = useState(play.san);
  const [sanDelta, setSanDelta] = useState(play.sanDelta);
  const [def, setDef] = useState(play.def);
  const [defDelta, setDefDelta] = useState(play.defDelta);
  const [atk, setAtk] = useState(play.atk);
  const [atkDelta, setAtkDelta] = useState(play.atkDelta);
  const [abilityType, setAbilityType] = useState(play.abilityType ?? "");
  const [credit, setCredit] = useState(play.credit ?? "");
  const [weaponTrainingStr, setWeaponTrainingStr] = useState(
    tagsToString(play.weaponTraining),
  );
  const [skillTrainingStr, setSkillTrainingStr] = useState(
    tagsToString(play.skillTraining),
  );
  const [equipment, setEquipment] = useState<Equipment[]>(play.equipment);
  const [abilities, setAbilities] = useState<Ability[]>(initAbilities(play.abilities));

  /* ── Form state ── */
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ── diff preview modal ── */
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pendingDiff, setPendingDiff] = useState<DiffEntry[]>([]);
  const [pendingBody, setPendingBody] = useState<Record<string, unknown> | null>(
    null,
  );

  /* ── Equipment helpers ── */
  function addEquipment() {
    setEquipment((prev) => [...prev, emptyEquipment()]);
  }
  function removeEquipment(index: number) {
    setEquipment((prev) => prev.filter((_, i) => i !== index));
  }
  function updateEquipment(
    index: number,
    field: keyof Equipment,
    value: string,
  ) {
    setEquipment((prev) =>
      prev.map((eq, i) => (i === index ? { ...eq, [field]: value } : eq)),
    );
  }

  /* ── Ability helpers (9-slot 고정, 슬롯 자체는 추가/삭제 불가) ── */
  function updateAbility(index: number, field: keyof Ability, value: string) {
    setAbilities((prev) =>
      prev.map((ab, i) => (i === index ? { ...ab, [field]: value } : ab)),
    );
  }

  /**
   * PATCH body 빌드 — sub-document 분리.
   *  - player: lore 8필드만
   *  - admin: root + lore + play
   */
  function buildBody(): Record<string, unknown> {
    if (isPlayer) {
      return {
        lore: {
          quote,
          appearance,
          personality,
          background,
          gender,
          age,
          height,
          weight,
        },
      };
    }

    return {
      codename,
      role,
      previewImage,
      isPublic,
      ownerId: ownerId || null,
      tier,
      department: department as AgentCharacter["department"],
      factionCode: emptyToUndefined(factionCode),
      institutionCode: emptyToUndefined(institutionCode),
      lore: {
        name,
        nameNative: emptyToUndefined(nameNative),
        nickname: emptyToUndefined(nickname),
        gender,
        age,
        height,
        weight,
        appearance,
        personality,
        background,
        quote,
        mainImage,
        posterImage: emptyToUndefined(posterImage),
      },
      play: {
        className,
        hp,
        hpDelta,
        san,
        sanDelta,
        def,
        defDelta,
        atk,
        atkDelta,
        abilityType: emptyToUndefined(abilityType),
        weaponTraining: stringToTags(weaponTrainingStr),
        skillTraining: stringToTags(skillTrainingStr),
        credit,
        equipment,
        abilities,
      },
    };
  }

  /** form state ↔ character props diff */
  function computeFormDiff(): DiffEntry[] {
    const fields = isPlayer ? PLAYER_DIFF_FIELDS : ADMIN_DIFF_FIELDS;

    const candidate = {
      codename,
      role,
      isPublic,
      previewImage,
      ownerId: ownerId || null,
      tier,
      department: department as AgentCharacter["department"],
      factionCode: emptyToUndefined(factionCode),
      institutionCode: emptyToUndefined(institutionCode),
      lore: {
        name,
        nameNative: emptyToUndefined(nameNative),
        nickname: emptyToUndefined(nickname),
        gender,
        age,
        height,
        weight,
        appearance,
        personality,
        background,
        quote,
        mainImage,
        posterImage: emptyToUndefined(posterImage),
      },
      play: {
        className,
        hp,
        hpDelta,
        san,
        sanDelta,
        def,
        defDelta,
        atk,
        atkDelta,
        abilityType: emptyToUndefined(abilityType),
        weaponTraining: stringToTags(weaponTrainingStr),
        skillTraining: stringToTags(skillTrainingStr),
        credit,
        equipment,
        abilities,
      },
    };

    return buildLocalDiff(character, candidate, fields);
  }

  async function performPatch(body: Record<string, unknown>, reason?: string) {
    setSubmitting(true);
    setError(null);

    const finalBody = reason ? { ...body, reason } : body;

    try {
      const res = await fetch(`/api/erp/characters/${characterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(finalBody),
      });

      if (!res.ok) {
        const data = await res.json();
        if (res.status === 429 && isPlayer) {
          await queryClient.invalidateQueries({
            queryKey: characterEditQuotaKeys.byCharacter(characterId),
          });
        }
        setError(data.error ?? "저장에 실패했습니다.");
        setSubmitting(false);
        return;
      }

      if (isPlayer) {
        await queryClient.invalidateQueries({
          queryKey: characterEditQuotaKeys.byCharacter(characterId),
        });
      }

      setPreviewOpen(false);
      setPendingDiff([]);
      setPendingBody(null);
      setSubmitting(false);
      onSaved();
    } catch {
      setError("네트워크 오류가 발생했습니다.");
      setSubmitting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const diff = computeFormDiff();
    if (diff.length === 0) {
      setError("변경 사항이 없습니다.");
      return;
    }

    setPendingDiff(diff);
    setPendingBody(buildBody());
    setPreviewOpen(true);
  }

  function handlePreviewConfirm(reason?: string) {
    if (!pendingBody) return;
    void performPatch(pendingBody, reason);
  }

  function handlePreviewCancel() {
    if (submitting) return;
    setPreviewOpen(false);
    setPendingDiff([]);
    setPendingBody(null);
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {/* ── 모드 안내 배너 ── */}
      <div
        className={[
          styles.modeBanner,
          isPlayer ? styles["modeBanner--player"] : "",
        ]
          .filter(Boolean)
          .join(" ")}
        role="status"
      >
        <div className={styles.modeBanner__eyebrow}>
          FORM-04 · CHARACTER REVISION
        </div>
        <div className={styles.modeBanner__row}>
          <div className={styles.modeBanner__text}>
            <b>{isPlayer ? "플레이어 편집 모드" : "관리자 편집 모드"}</b>
            {isPlayer
              ? "lore 서사 필드만 수정 가능합니다 (능력치 · 이미지는 GM 문의)."
              : "lore + play 모든 필드를 수정할 수 있습니다."}
          </div>
          <span
            className={`${styles.modeBadge} ${
              isPlayer ? styles["modeBadge--player"] : styles["modeBadge--admin"]
            }`}
          >
            {isPlayer ? "PLAYER" : "ADMIN"}
          </span>
        </div>
        {isPlayer && quotaData && quotaData.mode === "player" ? (
          <div
            className={styles.quota}
            aria-label={`최근 ${quotaData.windowHours}시간 편집 ${quotaData.used} / ${quotaData.maxCount}`}
          >
            최근 {quotaData.windowHours}h 편집{" "}
            <span className={styles.quota__num}>{quotaData.used}</span>
            <span className={styles.quota__sep}>/</span>
            <span className={styles.quota__total}>{quotaData.maxCount}</span>
            <span className={styles.quota__bar} aria-hidden>
              <span
                className={styles.quota__barFill}
                style={{
                  width: `${Math.min(
                    100,
                    Math.round((quotaData.used / quotaData.maxCount) * 100),
                  )}%`,
                }}
              />
            </span>
            {quotaData.remaining > 0 ? (
              <span className={styles.quota__note}>
                (남은 {quotaData.remaining}회)
              </span>
            ) : (
              <span className={styles.quota__note}>
                (가장 이른 편집이{" "}
                {new Date(quotaData.resetAt).toLocaleString("ko-KR")} 경에
                만료되어야 회복)
              </span>
            )}
          </div>
        ) : null}
      </div>

      {/* ── BASIC INFO (root + 일부 lore meta) ── */}
      <div className={styles.form__box}>
        <div className={styles.panelTitle}>
          <span className={styles.panelTitle__label}>BASIC INFO</span>
        </div>
        <div className={styles.form__box__body}>
          <div className={styles.grid}>
            <Field id="codename" label="CODENAME" locked={!isPlayer ? false : true}>
              <input
                id="codename"
                type="text"
                className={styles.input}
                value={codename}
                onChange={(e) => setCodename(e.target.value)}
                required={!isPlayer}
                disabled={isPlayer}
              />
            </Field>
            <Field id="role" label="ROLE" locked={isPlayer}>
              <input
                id="role"
                type="text"
                className={styles.input}
                value={role}
                onChange={(e) => setRole(e.target.value)}
                required={!isPlayer}
                disabled={isPlayer}
              />
            </Field>
            <Field id="tier" label="TIER" locked={isPlayer}>
              <select
                id="tier"
                className={styles.input}
                value={tier}
                onChange={(e) => setTier(e.target.value as CharacterTier)}
                disabled={isPlayer}
              >
                {CHARACTER_TIERS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="department" label="DEPARTMENT" locked={isPlayer}>
              <select
                id="department"
                className={styles.input}
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                disabled={isPlayer}
              >
                <option value="UNASSIGNED">미배정</option>
                {INSTITUTIONS.map((inst) =>
                  inst.subUnits.length > 0 ? (
                    <optgroup key={inst.code} label={inst.label}>
                      <option value={inst.code}>{inst.label} (직속)</option>
                      {inst.subUnits.map((u) => (
                        <option key={u.code} value={u.code}>
                          {u.label}
                        </option>
                      ))}
                    </optgroup>
                  ) : (
                    <optgroup key={inst.code} label="독립 기관">
                      <option value={inst.code}>{inst.label}</option>
                    </optgroup>
                  ),
                )}
              </select>
            </Field>
            <Field id="factionCode" label="FACTION" locked={isPlayer}>
              <select
                id="factionCode"
                className={styles.input}
                value={factionCode}
                onChange={(e) => setFactionCode(e.target.value)}
                disabled={isPlayer}
              >
                <option value="">미지정</option>
                {FACTIONS.map((f) => (
                  <option key={f.code} value={f.code}>
                    {f.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="institutionCode" label="INSTITUTION" locked={isPlayer}>
              <select
                id="institutionCode"
                className={styles.input}
                value={institutionCode}
                onChange={(e) => setInstitutionCode(e.target.value)}
                disabled={isPlayer}
              >
                <option value="">미지정</option>
                {INSTITUTIONS.map((inst) => (
                  <option key={inst.code} value={inst.code}>
                    {inst.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="ownerId" label="OWNER ID" locked={isPlayer}>
              <input
                id="ownerId"
                type="text"
                className={styles.input}
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                placeholder="소유자 ID (선택)"
                disabled={isPlayer}
              />
            </Field>
            <Field
              id="previewImage"
              label="PREVIEW IMAGE URL"
              full
              locked={isPlayer}
            >
              <input
                id="previewImage"
                type="text"
                className={styles.input}
                value={previewImage}
                onChange={(e) => setPreviewImage(e.target.value)}
                placeholder="미리보기 이미지 URL"
                disabled={isPlayer}
              />
            </Field>
            <div className={`${styles.field} ${styles["field--full"]}`}>
              <label
                className={[
                  styles.checkbox,
                  isPlayer ? styles["checkbox--locked"] : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  className={styles.checkbox__input}
                  disabled={isPlayer}
                />
                <span className={styles.checkbox__text}>공개 캐릭터</span>
                {isPlayer ? (
                  <span
                    className={styles.lockedBadge}
                    aria-label="GM 전용"
                    title="GM 전용"
                  >
                    GM
                  </span>
                ) : null}
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* ── LORE — 신원/서사 (8필드는 player 도 편집 가능) ── */}
      <div className={styles.form__box}>
        <div className={styles.panelTitle}>
          <span className={styles.panelTitle__label}>LORE · 신원 · 서사</span>
        </div>
        <div className={styles.form__box__body}>
          <div className={styles.grid}>
            <Field id="name" label="NAME" locked={isPlayer}>
              <input
                id="name"
                type="text"
                className={styles.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isPlayer}
              />
            </Field>
            <Field id="nameNative" label="NAME (NATIVE)" locked={isPlayer}>
              <input
                id="nameNative"
                type="text"
                className={styles.input}
                value={nameNative}
                onChange={(e) => setNameNative(e.target.value)}
                placeholder="원어 표기 (한자/일본어 등)"
                disabled={isPlayer}
              />
            </Field>
            <Field id="nickname" label="NICKNAME" locked={isPlayer}>
              <input
                id="nickname"
                type="text"
                className={styles.input}
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                disabled={isPlayer}
              />
            </Field>
            <Field id="gender" label="GENDER" locked={isLocked("gender")}>
              <input
                id="gender"
                type="text"
                className={styles.input}
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                disabled={isLocked("gender")}
              />
            </Field>
            <Field id="age" label="AGE" locked={isLocked("age")}>
              <input
                id="age"
                type="text"
                className={styles.input}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                disabled={isLocked("age")}
              />
            </Field>
            <Field id="height" label="HEIGHT" locked={isLocked("height")}>
              <input
                id="height"
                type="text"
                className={styles.input}
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                disabled={isLocked("height")}
              />
            </Field>
            <Field id="weight" label="WEIGHT" locked={isLocked("weight")}>
              <input
                id="weight"
                type="text"
                className={styles.input}
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                disabled={isLocked("weight")}
              />
            </Field>
            <Field id="quote" label="QUOTE" full locked={isLocked("quote")}>
              <input
                id="quote"
                type="text"
                className={styles.input}
                value={quote}
                onChange={(e) => setQuote(e.target.value)}
                disabled={isLocked("quote")}
              />
            </Field>
            <Field
              id="mainImage"
              label="MAIN IMAGE URL"
              full
              locked={isPlayer}
            >
              <input
                id="mainImage"
                type="text"
                className={styles.input}
                value={mainImage}
                onChange={(e) => setMainImage(e.target.value)}
                placeholder="메인 이미지 URL (세로 초상화)"
                disabled={isPlayer}
              />
            </Field>
            <Field
              id="posterImage"
              label="POSTER IMAGE URL"
              full
              locked={isPlayer}
            >
              <input
                id="posterImage"
                type="text"
                className={styles.input}
                value={posterImage}
                onChange={(e) => setPosterImage(e.target.value)}
                placeholder="캐릭터 상세 상단 와이드 히어로 (선택)"
                disabled={isPlayer}
              />
            </Field>
            <Field
              id="appearance"
              label="외모"
              full
              locked={isLocked("appearance")}
            >
              <textarea
                id="appearance"
                className={styles.textarea}
                value={appearance}
                onChange={(e) => setAppearance(e.target.value)}
                disabled={isLocked("appearance")}
              />
            </Field>
            <Field
              id="personality"
              label="성격"
              full
              locked={isLocked("personality")}
            >
              <textarea
                id="personality"
                className={styles.textarea}
                value={personality}
                onChange={(e) => setPersonality(e.target.value)}
                disabled={isLocked("personality")}
              />
            </Field>
            <Field
              id="background"
              label="배경"
              full
              locked={isLocked("background")}
            >
              <textarea
                id="background"
                className={styles.textarea}
                value={background}
                onChange={(e) => setBackground(e.target.value)}
                disabled={isLocked("background")}
              />
            </Field>
          </div>
        </div>
      </div>

      {/* ── PLAY (admin only) ── */}
      {!isPlayer ? (
        <>
          <div className={styles.form__box}>
            <div className={styles.panelTitle}>
              <span className={styles.panelTitle__label}>
                COMBAT STATS · base + delta 메모
              </span>
            </div>
            <div className={styles.form__box__body}>
              <div className={styles.statGrid}>
                <Field id="hp" label="HP">
                  <input
                    id="hp"
                    type="number"
                    className={`${styles.input} ${styles["input--num"]}`}
                    value={hp}
                    onChange={(e) => setHp(Number(e.target.value))}
                  />
                </Field>
                <Field id="hpDelta" label="HP Δ">
                  <input
                    id="hpDelta"
                    type="number"
                    className={`${styles.input} ${styles["input--num"]}`}
                    value={hpDelta}
                    onChange={(e) => setHpDelta(Number(e.target.value))}
                  />
                </Field>
                <Field id="san" label="SAN">
                  <input
                    id="san"
                    type="number"
                    className={`${styles.input} ${styles["input--num"]}`}
                    value={san}
                    onChange={(e) => setSan(Number(e.target.value))}
                  />
                </Field>
                <Field id="sanDelta" label="SAN Δ">
                  <input
                    id="sanDelta"
                    type="number"
                    className={`${styles.input} ${styles["input--num"]}`}
                    value={sanDelta}
                    onChange={(e) => setSanDelta(Number(e.target.value))}
                  />
                </Field>
                <Field id="def" label="DEF">
                  <input
                    id="def"
                    type="number"
                    className={`${styles.input} ${styles["input--num"]}`}
                    value={def}
                    onChange={(e) => setDef(Number(e.target.value))}
                  />
                </Field>
                <Field id="defDelta" label="DEF Δ">
                  <input
                    id="defDelta"
                    type="number"
                    className={`${styles.input} ${styles["input--num"]}`}
                    value={defDelta}
                    onChange={(e) => setDefDelta(Number(e.target.value))}
                  />
                </Field>
                <Field id="atk" label="ATK">
                  <input
                    id="atk"
                    type="number"
                    className={`${styles.input} ${styles["input--num"]}`}
                    value={atk}
                    onChange={(e) => setAtk(Number(e.target.value))}
                  />
                </Field>
                <Field id="atkDelta" label="ATK Δ">
                  <input
                    id="atkDelta"
                    type="number"
                    className={`${styles.input} ${styles["input--num"]}`}
                    value={atkDelta}
                    onChange={(e) => setAtkDelta(Number(e.target.value))}
                  />
                </Field>
              </div>
            </div>
          </div>

          <div className={styles.form__box}>
            <div className={styles.panelTitle}>
              <span className={styles.panelTitle__label}>AGENT DETAILS</span>
            </div>
            <div className={styles.form__box__body}>
              <div className={styles.grid}>
                <Field id="className" label="CLASS">
                  <input
                    id="className"
                    type="text"
                    className={styles.input}
                    value={className}
                    onChange={(e) => setClassName(e.target.value)}
                  />
                </Field>
                <Field id="abilityType" label="ABILITY TYPE">
                  <input
                    id="abilityType"
                    type="text"
                    className={styles.input}
                    value={abilityType}
                    onChange={(e) => setAbilityType(e.target.value)}
                  />
                </Field>
                <Field id="credit" label="CREDIT">
                  <input
                    id="credit"
                    type="text"
                    className={styles.input}
                    value={credit}
                    onChange={(e) => setCredit(e.target.value)}
                  />
                </Field>
                <Field
                  id="weaponTraining"
                  label="WEAPON TRAINING (콤마 구분)"
                  full
                >
                  <input
                    id="weaponTraining"
                    type="text"
                    className={styles.input}
                    value={weaponTrainingStr}
                    onChange={(e) => setWeaponTrainingStr(e.target.value)}
                    placeholder="권총, 산탄총"
                  />
                </Field>
                <Field
                  id="skillTraining"
                  label="SKILL TRAINING (콤마 구분)"
                  full
                >
                  <input
                    id="skillTraining"
                    type="text"
                    className={styles.input}
                    value={skillTrainingStr}
                    onChange={(e) => setSkillTrainingStr(e.target.value)}
                    placeholder="유혹, 설득, 샘플관리"
                  />
                </Field>
              </div>
            </div>
          </div>

          {/* Equipment list */}
          <div className={styles.form__box}>
            <div className={styles.panelTitle}>
              <span className={styles.panelTitle__label}>EQUIPMENT</span>
              <div className={styles.panelTitle__right}>
                <button
                  type="button"
                  className={`${styles.ghostBtn} ${styles["ghostBtn--add"]}`}
                  onClick={addEquipment}
                >
                  추가
                </button>
              </div>
            </div>
            <div className={styles.form__box__body}>
              {equipment.length === 0 ? (
                <div className={styles.empty}>장비 없음</div>
              ) : (
                <div className={styles.list}>
                  {equipment.map((eq, i) => (
                    <div key={i} className={styles.listItem}>
                      <div className={styles.listItem__head}>
                        <span className={styles.listItem__title}>
                          ITEM <b>#{String(i + 1).padStart(2, "0")}</b>
                        </span>
                        <button
                          type="button"
                          className={`${styles.ghostBtn} ${styles["ghostBtn--remove"]}`}
                          onClick={() => removeEquipment(i)}
                        >
                          삭제
                        </button>
                      </div>
                      <div className={styles.listItem__body}>
                        <div className={styles.grid}>
                          <Field id={`eq-name-${i}`} label="NAME">
                            <input
                              id={`eq-name-${i}`}
                              type="text"
                              className={styles.input}
                              value={eq.name}
                              onChange={(e) =>
                                updateEquipment(i, "name", e.target.value)
                              }
                            />
                          </Field>
                          <Field id={`eq-price-${i}`} label="PRICE">
                            <input
                              id={`eq-price-${i}`}
                              type="text"
                              className={styles.input}
                              value={String(eq.price ?? "")}
                              onChange={(e) =>
                                updateEquipment(i, "price", e.target.value)
                              }
                            />
                          </Field>
                          <Field id={`eq-damage-${i}`} label="DAMAGE">
                            <input
                              id={`eq-damage-${i}`}
                              type="text"
                              className={styles.input}
                              value={eq.damage ?? ""}
                              onChange={(e) =>
                                updateEquipment(i, "damage", e.target.value)
                              }
                            />
                          </Field>
                          <Field id={`eq-ammo-${i}`} label="AMMO">
                            <input
                              id={`eq-ammo-${i}`}
                              type="text"
                              className={styles.input}
                              value={eq.ammo ?? ""}
                              onChange={(e) =>
                                updateEquipment(i, "ammo", e.target.value)
                              }
                              placeholder="5/5"
                            />
                          </Field>
                          <Field id={`eq-grip-${i}`} label="GRIP">
                            <input
                              id={`eq-grip-${i}`}
                              type="text"
                              className={styles.input}
                              value={eq.grip ?? ""}
                              onChange={(e) =>
                                updateEquipment(i, "grip", e.target.value)
                              }
                              placeholder="양손, 혹은 한손"
                            />
                          </Field>
                          <Field id={`eq-desc-${i}`} label="DESCRIPTION" full>
                            <input
                              id={`eq-desc-${i}`}
                              type="text"
                              className={styles.input}
                              value={eq.description ?? ""}
                              onChange={(e) =>
                                updateEquipment(i, "description", e.target.value)
                              }
                            />
                          </Field>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Abilities — 11-슬롯 고정 그리드 */}
          <div className={styles.form__box}>
            <div className={styles.panelTitle}>
              <span className={styles.panelTitle__label}>
                ABILITIES · 11 SLOTS (C1~C5/P/A1~A5)
              </span>
            </div>
            <div className={styles.form__box__body}>
              <div className={styles.list}>
                {abilities.map((ab, i) => (
                  <div key={ab.slot} className={styles.listItem}>
                    <div className={styles.listItem__head}>
                      <span className={styles.listItem__title}>
                        SLOT <b>{ab.slot}</b>
                      </span>
                    </div>
                    <div className={styles.listItem__body}>
                      <div className={styles.grid}>
                        <Field id={`ab-name-${i}`} label="NAME">
                          <input
                            id={`ab-name-${i}`}
                            type="text"
                            className={styles.input}
                            value={ab.name}
                            onChange={(e) =>
                              updateAbility(i, "name", e.target.value)
                            }
                          />
                        </Field>
                        <Field id={`ab-code-${i}`} label="CODE">
                          <input
                            id={`ab-code-${i}`}
                            type="text"
                            className={styles.input}
                            value={ab.code ?? ""}
                            onChange={(e) =>
                              updateAbility(i, "code", e.target.value)
                            }
                          />
                        </Field>
                        <Field id={`ab-desc-${i}`} label="DESCRIPTION" full>
                          <input
                            id={`ab-desc-${i}`}
                            type="text"
                            className={styles.input}
                            value={ab.description ?? ""}
                            onChange={(e) =>
                              updateAbility(i, "description", e.target.value)
                            }
                          />
                        </Field>
                        <Field id={`ab-effect-${i}`} label="EFFECT" full>
                          <input
                            id={`ab-effect-${i}`}
                            type="text"
                            className={styles.input}
                            value={ab.effect ?? ""}
                            onChange={(e) =>
                              updateAbility(i, "effect", e.target.value)
                            }
                          />
                        </Field>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : null}

      {/* ── Actions ── */}
      {error ? <div className={styles.error}>{error}</div> : null}

      <div className={styles.actions}>
        <span className={styles.actions__notice}>감사 로그 자동 기록</span>
        <button
          type="button"
          className={styles.cancelBtn}
          onClick={onCancel}
          disabled={submitting}
        >
          취소
        </button>
        <button
          type="submit"
          className={styles.submitBtn}
          disabled={submitting}
          aria-busy={submitting}
        >
          {submitting ? "저장 중" : "저장"}
        </button>
      </div>

      {/* ── diff 프리뷰 모달 ── */}
      {previewOpen ? (
        <DiffPreviewModal
          diff={pendingDiff}
          mode={isPlayer ? "player" : "admin"}
          cooldown={
            isPlayer && quotaData && quotaData.mode === "player"
              ? {
                  used: quotaData.used,
                  remaining: quotaData.remaining,
                  maxCount: quotaData.maxCount,
                  windowHours: quotaData.windowHours,
                }
              : undefined
          }
          characterLabel={
            character.lore.name && character.lore.name !== character.codename
              ? `${character.lore.name} / ${character.codename}`
              : character.codename
          }
          isSubmitting={submitting}
          onConfirm={handlePreviewConfirm}
          onCancel={handlePreviewCancel}
        />
      ) : null}
    </form>
  );
}

function Field({
  id,
  label,
  children,
  full = false,
  locked = false,
}: {
  id?: string;
  label: string;
  children: React.ReactNode;
  full?: boolean;
  /** true 이면 라벨 옆에 'GM' 자물쇠 배지 표시. 입력 비활성화는 호출자(disabled prop)가 별도 책임. */
  locked?: boolean;
}) {
  return (
    <div
      className={[styles.field, full ? styles["field--full"] : ""]
        .filter(Boolean)
        .join(" ")}
    >
      <label
        className={[styles.label, locked ? styles["label--locked"] : ""]
          .filter(Boolean)
          .join(" ")}
        htmlFor={id}
      >
        <span className={styles.label__text}>{label}</span>
        {locked ? (
          <span
            className={styles.lockedBadge}
            aria-label="GM 전용 필드"
            title="GM 전용 필드"
          >
            GM
          </span>
        ) : null}
      </label>
      {children}
    </div>
  );
}
