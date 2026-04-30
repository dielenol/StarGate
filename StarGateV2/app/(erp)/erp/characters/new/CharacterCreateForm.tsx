"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type {
  Ability,
  AbilitySlot,
  AgentCharacter,
  AgentLevel,
  Equipment,
  LoreSheet,
  PlaySheet,
} from "@/types/character";
import {
  AGENT_LEVELS,
  AGENT_LEVEL_LABELS,
  FACTIONS,
  INSTITUTIONS,
} from "@/types/character";

import { useCreateCharacter } from "@/hooks/mutations/useCharacterMutation";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import Input from "@/components/ui/Input/Input";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";
import Select from "@/components/ui/Select/Select";

import styles from "../[id]/CharacterEditForm.module.css";

/* ── Default factories ── */

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

function emptyEquipment(): Equipment {
  return { name: "", price: "", damage: "", ammo: "", grip: "", description: "" };
}

function initAbilities(): Ability[] {
  return ABILITY_SLOTS.map((slot) => ({ slot, name: "" }));
}

function stringToTags(s: string): string[] {
  return s
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/**
 * `/erp/characters/new` — AGENT 신규 생성 전용 폼.
 *
 * NPC 생성은 `/create-lore npc` skill 또는 admin 도구로 처리한다 (게임 시트 없음).
 * 여기서는 type=AGENT 만 다루며, 본 폼이 직접 lore + play 두 sub-document 를 빌드해 POST.
 */
export default function CharacterCreateForm() {
  const router = useRouter();

  /* ── Mutation ── */
  const createCharacter = useCreateCharacter();

  /* ── Root meta ── */
  const [codename, setCodename] = useState("");
  const [role, setRole] = useState("");
  const [agentLevel, setAgentLevel] = useState<AgentLevel>("J");
  const [department, setDepartment] = useState("UNASSIGNED");
  const [factionCode, setFactionCode] = useState("");
  const [institutionCode, setInstitutionCode] = useState("");
  const [previewImage, setPreviewImage] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [ownerId, setOwnerId] = useState("");

  /* ── Lore ── */
  const [name, setName] = useState("");
  const [nameNative, setNameNative] = useState("");
  const [nickname, setNickname] = useState("");
  const [mainImage, setMainImage] = useState("");
  const [posterImage, setPosterImage] = useState("");
  const [quote, setQuote] = useState("");
  const [gender, setGender] = useState("");
  const [age, setAge] = useState("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [appearance, setAppearance] = useState("");
  const [personality, setPersonality] = useState("");
  const [background, setBackground] = useState("");

  /* ── Play ── */
  const [className, setClassName] = useState("");
  const [hp, setHp] = useState(0);
  const [hpDelta, setHpDelta] = useState(0);
  const [san, setSan] = useState(0);
  const [sanDelta, setSanDelta] = useState(0);
  const [def, setDef] = useState(0);
  const [defDelta, setDefDelta] = useState(0);
  const [atk, setAtk] = useState(0);
  const [atkDelta, setAtkDelta] = useState(0);
  const [abilityType, setAbilityType] = useState("");
  const [credit, setCredit] = useState("");
  const [weaponTrainingStr, setWeaponTrainingStr] = useState("");
  const [skillTrainingStr, setSkillTrainingStr] = useState("");
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [abilities, setAbilities] = useState<Ability[]>(initAbilities());

  /* ── Form state ── */
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  /* ── Ability helpers — 11-슬롯 고정 ── */
  function updateAbility(index: number, field: keyof Ability, value: string) {
    setAbilities((prev) =>
      prev.map((ab, i) => (i === index ? { ...ab, [field]: value } : ab)),
    );
  }

  /* ── Submit ── */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const lore: LoreSheet = {
      name,
      nameNative: nameNative || undefined,
      nickname: nickname || undefined,
      gender,
      age,
      height,
      weight,
      appearance,
      personality,
      background,
      quote,
      mainImage,
      posterImage: posterImage || undefined,
    };

    const play: PlaySheet = {
      className,
      hp,
      hpDelta,
      san,
      sanDelta,
      def,
      defDelta,
      atk,
      atkDelta,
      abilityType: abilityType || undefined,
      weaponTraining: stringToTags(weaponTrainingStr),
      skillTraining: stringToTags(skillTrainingStr),
      credit,
      equipment,
      abilities,
    };

    // AGENT 생성 입력 — Omit<Character, ...> 가 union 에서 모든 변종을 합쳐서 never 가 되는
    // 회피책으로 `Omit<AgentCharacter, ...>` 로 직접 좁힌다.
    const body: Omit<AgentCharacter, "_id" | "createdAt" | "updatedAt"> = {
      codename,
      type: "AGENT",
      role,
      agentLevel,
      department: department as AgentCharacter["department"],
      factionCode: factionCode || undefined,
      institutionCode: institutionCode || undefined,
      previewImage,
      isPublic,
      ownerId: ownerId || null,
      lore,
      play,
    };

    try {
      // mutation hook 이 onSuccess 에서 characterKeys.all + personnelKeys.all 를
      // invalidate. router.refresh 대신 캐시 갱신만으로 목록 페이지 재진입 시 최신 표시.
      await createCharacter.mutateAsync(body);
      router.push("/erp/characters");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "네트워크 오류가 발생했습니다.",
      );
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {/* ── Common Fields ── */}
      <Box className={styles.form__box}>
        <PanelTitle>BASIC INFO · AGENT</PanelTitle>
        <div className={styles.grid}>
          <Field id="codename" label="CODENAME">
            <Input
              id="codename"
              type="text"
              value={codename}
              onChange={(e) => setCodename(e.target.value)}
              required
            />
          </Field>
          <Field id="role" label="ROLE">
            <Input
              id="role"
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              required
            />
          </Field>
          <Field id="agentLevel" label="AGENT LEVEL">
            <Select
              id="agentLevel"
              value={agentLevel}
              onChange={(e) => setAgentLevel(e.target.value as AgentLevel)}
            >
              {AGENT_LEVELS.map((lvl) => (
                <option key={lvl} value={lvl}>
                  {lvl} — {AGENT_LEVEL_LABELS[lvl]}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="department" label="DEPARTMENT">
            <Select
              id="department"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
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
            </Select>
          </Field>
          <Field id="factionCode" label="FACTION">
            <Select
              id="factionCode"
              value={factionCode}
              onChange={(e) => setFactionCode(e.target.value)}
            >
              <option value="">미지정</option>
              {FACTIONS.map((f) => (
                <option key={f.code} value={f.code}>
                  {f.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="institutionCode" label="INSTITUTION">
            <Select
              id="institutionCode"
              value={institutionCode}
              onChange={(e) => setInstitutionCode(e.target.value)}
            >
              <option value="">미지정</option>
              {INSTITUTIONS.map((inst) => (
                <option key={inst.code} value={inst.code}>
                  {inst.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="ownerId" label="OWNER ID">
            <Input
              id="ownerId"
              type="text"
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              placeholder="소유자 ID (선택)"
            />
          </Field>
          <Field id="previewImage" label="PREVIEW IMAGE URL" full>
            <Input
              id="previewImage"
              type="text"
              value={previewImage}
              onChange={(e) => setPreviewImage(e.target.value)}
              placeholder="미리보기 이미지 URL"
            />
          </Field>
          <div className={`${styles.field} ${styles["field--full"]}`}>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className={styles.checkbox__input}
              />
              <span>공개 캐릭터</span>
            </label>
          </div>
        </div>
      </Box>

      {/* ── LORE ── */}
      <Box className={styles.form__box}>
        <PanelTitle>LORE · 신원 · 서사</PanelTitle>
        <div className={styles.grid}>
          <Field id="name" label="NAME">
            <Input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field id="nameNative" label="NAME (NATIVE)">
            <Input
              id="nameNative"
              type="text"
              value={nameNative}
              onChange={(e) => setNameNative(e.target.value)}
              placeholder="원어 표기"
            />
          </Field>
          <Field id="nickname" label="NICKNAME">
            <Input
              id="nickname"
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
          </Field>
          <Field id="gender" label="GENDER">
            <Input
              id="gender"
              type="text"
              value={gender}
              onChange={(e) => setGender(e.target.value)}
            />
          </Field>
          <Field id="age" label="AGE">
            <Input
              id="age"
              type="text"
              value={age}
              onChange={(e) => setAge(e.target.value)}
            />
          </Field>
          <Field id="height" label="HEIGHT">
            <Input
              id="height"
              type="text"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
            />
          </Field>
          <Field id="weight" label="WEIGHT">
            <Input
              id="weight"
              type="text"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </Field>
          <Field id="quote" label="QUOTE" full>
            <Input
              id="quote"
              type="text"
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
            />
          </Field>
          <Field id="mainImage" label="MAIN IMAGE URL" full>
            <Input
              id="mainImage"
              type="text"
              value={mainImage}
              onChange={(e) => setMainImage(e.target.value)}
              placeholder="메인 이미지 URL"
            />
          </Field>
          <Field id="posterImage" label="POSTER IMAGE URL" full>
            <Input
              id="posterImage"
              type="text"
              value={posterImage}
              onChange={(e) => setPosterImage(e.target.value)}
              placeholder="포스터 이미지 URL (선택)"
            />
          </Field>
          <Field id="appearance" label="외모" full>
            <textarea
              id="appearance"
              className={styles.textarea}
              value={appearance}
              onChange={(e) => setAppearance(e.target.value)}
            />
          </Field>
          <Field id="personality" label="성격" full>
            <textarea
              id="personality"
              className={styles.textarea}
              value={personality}
              onChange={(e) => setPersonality(e.target.value)}
            />
          </Field>
          <Field id="background" label="배경" full>
            <textarea
              id="background"
              className={styles.textarea}
              value={background}
              onChange={(e) => setBackground(e.target.value)}
            />
          </Field>
        </div>
      </Box>

      {/* ── PLAY ── */}
      <Box className={styles.form__box}>
        <PanelTitle>COMBAT STATS · base + delta</PanelTitle>
        <div className={styles.statGrid}>
          <Field id="hp" label="HP">
            <Input
              id="hp"
              type="number"
              value={hp}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) setHp(n);
              }}
            />
          </Field>
          <Field id="hpDelta" label="HP Δ">
            <Input
              id="hpDelta"
              type="number"
              value={hpDelta}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) setHpDelta(n);
              }}
            />
          </Field>
          <Field id="san" label="SAN">
            <Input
              id="san"
              type="number"
              value={san}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) setSan(n);
              }}
            />
          </Field>
          <Field id="sanDelta" label="SAN Δ">
            <Input
              id="sanDelta"
              type="number"
              value={sanDelta}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) setSanDelta(n);
              }}
            />
          </Field>
          <Field id="def" label="DEF">
            <Input
              id="def"
              type="number"
              value={def}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) setDef(n);
              }}
            />
          </Field>
          <Field id="defDelta" label="DEF Δ">
            <Input
              id="defDelta"
              type="number"
              value={defDelta}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) setDefDelta(n);
              }}
            />
          </Field>
          <Field id="atk" label="ATK">
            <Input
              id="atk"
              type="number"
              value={atk}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) setAtk(n);
              }}
            />
          </Field>
          <Field id="atkDelta" label="ATK Δ">
            <Input
              id="atkDelta"
              type="number"
              value={atkDelta}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) setAtkDelta(n);
              }}
            />
          </Field>
        </div>
      </Box>

      <Box className={styles.form__box}>
        <PanelTitle>AGENT DETAILS</PanelTitle>
        <div className={styles.grid}>
          <Field id="className" label="CLASS">
            <Input
              id="className"
              type="text"
              value={className}
              onChange={(e) => setClassName(e.target.value)}
            />
          </Field>
          <Field id="abilityType" label="ABILITY TYPE">
            <Input
              id="abilityType"
              type="text"
              value={abilityType}
              onChange={(e) => setAbilityType(e.target.value)}
            />
          </Field>
          <Field id="credit" label="CREDIT">
            <Input
              id="credit"
              type="text"
              value={credit}
              onChange={(e) => setCredit(e.target.value)}
            />
          </Field>
          <Field id="weaponTraining" label="WEAPON TRAINING (콤마 구분)" full>
            <Input
              id="weaponTraining"
              type="text"
              value={weaponTrainingStr}
              onChange={(e) => setWeaponTrainingStr(e.target.value)}
              placeholder="권총, 산탄총"
            />
          </Field>
          <Field id="skillTraining" label="SKILL TRAINING (콤마 구분)" full>
            <Input
              id="skillTraining"
              type="text"
              value={skillTrainingStr}
              onChange={(e) => setSkillTrainingStr(e.target.value)}
              placeholder="유혹, 설득"
            />
          </Field>
        </div>
      </Box>

      {/* Equipment */}
      <Box className={styles.form__box}>
        <PanelTitle
          right={
            <Button type="button" size="sm" onClick={addEquipment}>
              + 추가
            </Button>
          }
        >
          EQUIPMENT
        </PanelTitle>
        {equipment.length === 0 ? (
          <div className={styles.empty}>장비 없음</div>
        ) : (
          <div className={styles.list}>
            {equipment.map((eq, i) => (
              <div key={i} className={styles.listItem}>
                <div className={styles.listItem__head}>
                  <span className={styles.listItem__title}>ITEM #{i + 1}</span>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => removeEquipment(i)}
                  >
                    삭제
                  </Button>
                </div>
                <div className={styles.grid}>
                  <Field id={`eq-name-${i}`} label="NAME">
                    <Input
                      id={`eq-name-${i}`}
                      type="text"
                      value={eq.name}
                      onChange={(e) =>
                        updateEquipment(i, "name", e.target.value)
                      }
                    />
                  </Field>
                  <Field id={`eq-price-${i}`} label="PRICE">
                    <Input
                      id={`eq-price-${i}`}
                      type="text"
                      value={String(eq.price ?? "")}
                      onChange={(e) =>
                        updateEquipment(i, "price", e.target.value)
                      }
                    />
                  </Field>
                  <Field id={`eq-damage-${i}`} label="DAMAGE">
                    <Input
                      id={`eq-damage-${i}`}
                      type="text"
                      value={eq.damage ?? ""}
                      onChange={(e) =>
                        updateEquipment(i, "damage", e.target.value)
                      }
                    />
                  </Field>
                  <Field id={`eq-ammo-${i}`} label="AMMO">
                    <Input
                      id={`eq-ammo-${i}`}
                      type="text"
                      value={eq.ammo ?? ""}
                      onChange={(e) =>
                        updateEquipment(i, "ammo", e.target.value)
                      }
                      placeholder="5/5"
                    />
                  </Field>
                  <Field id={`eq-grip-${i}`} label="GRIP">
                    <Input
                      id={`eq-grip-${i}`}
                      type="text"
                      value={eq.grip ?? ""}
                      onChange={(e) =>
                        updateEquipment(i, "grip", e.target.value)
                      }
                      placeholder="양손, 혹은 한손"
                    />
                  </Field>
                  <Field id={`eq-desc-${i}`} label="DESCRIPTION">
                    <Input
                      id={`eq-desc-${i}`}
                      type="text"
                      value={eq.description ?? ""}
                      onChange={(e) =>
                        updateEquipment(i, "description", e.target.value)
                      }
                    />
                  </Field>
                </div>
              </div>
            ))}
          </div>
        )}
      </Box>

      {/* Abilities — 7 슬롯 */}
      <Box className={styles.form__box}>
        <PanelTitle>ABILITIES · 11 SLOTS (C1~C5/P/A1~A5)</PanelTitle>
        <div className={styles.list}>
          {abilities.map((ab, i) => (
            <div key={ab.slot} className={styles.listItem}>
              <div className={styles.listItem__head}>
                <span className={styles.listItem__title}>
                  SLOT <b>{ab.slot}</b>
                </span>
              </div>
              <div className={styles.grid}>
                <Field id={`ab-name-${i}`} label="NAME">
                  <Input
                    id={`ab-name-${i}`}
                    type="text"
                    value={ab.name}
                    onChange={(e) =>
                      updateAbility(i, "name", e.target.value)
                    }
                  />
                </Field>
                <Field id={`ab-code-${i}`} label="CODE">
                  <Input
                    id={`ab-code-${i}`}
                    type="text"
                    value={ab.code ?? ""}
                    onChange={(e) =>
                      updateAbility(i, "code", e.target.value)
                    }
                  />
                </Field>
                <Field id={`ab-desc-${i}`} label="DESCRIPTION" full>
                  <Input
                    id={`ab-desc-${i}`}
                    type="text"
                    value={ab.description ?? ""}
                    onChange={(e) =>
                      updateAbility(i, "description", e.target.value)
                    }
                  />
                </Field>
                <Field id={`ab-effect-${i}`} label="EFFECT" full>
                  <Input
                    id={`ab-effect-${i}`}
                    type="text"
                    value={ab.effect ?? ""}
                    onChange={(e) =>
                      updateAbility(i, "effect", e.target.value)
                    }
                  />
                </Field>
              </div>
            </div>
          ))}
        </div>
      </Box>

      {/* ── Actions ── */}
      {error ? <div className={styles.error}>{error}</div> : null}

      <div className={styles.actions}>
        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting ? "생성 중..." : "캐릭터 생성"}
        </Button>
        <Button as="a" href="/erp/characters">
          취소
        </Button>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  children,
  full = false,
}: {
  id?: string;
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div
      className={[styles.field, full ? styles["field--full"] : ""]
        .filter(Boolean)
        .join(" ")}
    >
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      {children}
    </div>
  );
}
