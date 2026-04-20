"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type {
  Ability,
  AgentLevel,
  AgentSheet,
  CharacterType,
  Equipment,
  NpcSheet,
} from "@/types/character";
import {
  AGENT_LEVELS,
  AGENT_LEVEL_LABELS,
  FACTIONS,
  INSTITUTIONS,
} from "@/types/character";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import Input from "@/components/ui/Input/Input";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";
import Select from "@/components/ui/Select/Select";

import styles from "../[id]/CharacterEditForm.module.css";

/* ── Default factories ── */

function emptyEquipment(): Equipment {
  return { name: "", price: "", damage: "", description: "" };
}

function emptyAbility(): Ability {
  return { code: "", name: "", description: "", effect: "" };
}

export default function CharacterCreateForm() {
  const router = useRouter();

  /* ── Type selection ── */
  const [type, setType] = useState<CharacterType>("AGENT");

  /* ── Common fields ── */
  const [codename, setCodename] = useState("");
  const [role, setRole] = useState("");
  const [agentLevel, setAgentLevel] = useState<AgentLevel>("J");
  const [department, setDepartment] = useState("UNASSIGNED");
  const [previewImage, setPreviewImage] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [ownerId, setOwnerId] = useState("");

  /* ── Sheet common ── */
  const [name, setName] = useState("");
  const [mainImage, setMainImage] = useState("");
  const [quote, setQuote] = useState("");
  const [gender, setGender] = useState("");
  const [age, setAge] = useState("");
  const [height, setHeight] = useState("");
  const [appearance, setAppearance] = useState("");
  const [personality, setPersonality] = useState("");
  const [background, setBackground] = useState("");

  /* ── Agent-specific ── */
  const [weight, setWeight] = useState("");
  const [className, setClassName] = useState("");
  const [hp, setHp] = useState(0);
  const [san, setSan] = useState(0);
  const [def, setDef] = useState(0);
  const [atk, setAtk] = useState(0);
  const [abilityType, setAbilityType] = useState("");
  const [credit, setCredit] = useState("");
  const [weaponTraining, setWeaponTraining] = useState("");
  const [skillTraining, setSkillTraining] = useState("");
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [abilities, setAbilities] = useState<Ability[]>([]);

  /* ── NPC-specific ── */
  const [nameEn, setNameEn] = useState("");
  const [roleDetail, setRoleDetail] = useState("");
  const [notes, setNotes] = useState("");

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

  /* ── Ability helpers ── */
  function addAbility() {
    setAbilities((prev) => [...prev, emptyAbility()]);
  }

  function removeAbility(index: number) {
    setAbilities((prev) => prev.filter((_, i) => i !== index));
  }

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

    const sheetBase = {
      codename,
      name,
      mainImage,
      quote,
      gender,
      age,
      height,
      appearance,
      personality,
      background,
    };

    let sheet: AgentSheet | NpcSheet;

    if (type === "AGENT") {
      sheet = {
        ...sheetBase,
        weight,
        className,
        hp,
        san,
        def,
        atk,
        abilityType,
        credit: credit === "" ? "" : Number(credit) || credit,
        weaponTraining,
        skillTraining,
        equipment,
        abilities,
      };
    } else {
      sheet = {
        ...sheetBase,
        nameEn,
        roleDetail,
        notes,
      };
    }

    const body = {
      codename,
      type,
      role,
      agentLevel,
      department,
      previewImage,
      isPublic,
      ownerId: ownerId || null,
      sheet,
    };

    try {
      const res = await fetch("/api/erp/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "생성에 실패했습니다.");
        setSubmitting(false);
        return;
      }

      router.push("/erp/characters");
    } catch {
      setError("네트워크 오류가 발생했습니다.");
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {/* ── Type Selection ── */}
      <Box className={styles.form__box}>
        <PanelTitle>CHARACTER TYPE</PanelTitle>
        <div className={styles.grid}>
          <Field id="type" label="TYPE">
            <Select
              id="type"
              value={type}
              onChange={(e) => setType(e.target.value as CharacterType)}
            >
              <option value="AGENT">AGENT</option>
              <option value="NPC">NPC</option>
            </Select>
          </Field>
        </div>
      </Box>

      {/* ── Common Fields ── */}
      <Box className={styles.form__box}>
        <PanelTitle>BASIC INFO</PanelTitle>
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
              <optgroup label="3대 세력">
                {FACTIONS.map((f) => (
                  <option key={f.code} value={f.code}>
                    {f.label}
                  </option>
                ))}
              </optgroup>
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
          <Field id="name" label="NAME">
            <Input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
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
          <Field id="mainImage" label="MAIN IMAGE URL" full>
            <Input
              id="mainImage"
              type="text"
              value={mainImage}
              onChange={(e) => setMainImage(e.target.value)}
              placeholder="메인 이미지 URL"
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

      {/* ── Sheet Common ── */}
      <Box className={styles.form__box}>
        <PanelTitle>CHARACTER PROFILE</PanelTitle>
        <div className={styles.grid}>
          <Field id="quote" label="QUOTE">
            <Input
              id="quote"
              type="text"
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
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

      {/* ── Agent-specific ── */}
      {type === "AGENT" ? (
        <>
          <Box className={styles.form__box}>
            <PanelTitle>COMBAT STATS</PanelTitle>
            <div className={styles.statGrid}>
              <Field id="hp" label="HP">
                <Input
                  id="hp"
                  type="number"
                  value={hp}
                  onChange={(e) => setHp(Number(e.target.value))}
                />
              </Field>
              <Field id="san" label="SAN">
                <Input
                  id="san"
                  type="number"
                  value={san}
                  onChange={(e) => setSan(Number(e.target.value))}
                />
              </Field>
              <Field id="def" label="DEF">
                <Input
                  id="def"
                  type="number"
                  value={def}
                  onChange={(e) => setDef(Number(e.target.value))}
                />
              </Field>
              <Field id="atk" label="ATK">
                <Input
                  id="atk"
                  type="number"
                  value={atk}
                  onChange={(e) => setAtk(Number(e.target.value))}
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
              <Field id="weight" label="WEIGHT">
                <Input
                  id="weight"
                  type="text"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
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
              <Field id="weaponTraining" label="WEAPON TRAINING">
                <Input
                  id="weaponTraining"
                  type="text"
                  value={weaponTraining}
                  onChange={(e) => setWeaponTraining(e.target.value)}
                />
              </Field>
              <Field id="skillTraining" label="SKILL TRAINING">
                <Input
                  id="skillTraining"
                  type="text"
                  value={skillTraining}
                  onChange={(e) => setSkillTraining(e.target.value)}
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
                      <span className={styles.listItem__title}>
                        ITEM #{i + 1}
                      </span>
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
                          value={String(eq.price)}
                          onChange={(e) =>
                            updateEquipment(i, "price", e.target.value)
                          }
                        />
                      </Field>
                      <Field id={`eq-damage-${i}`} label="DAMAGE">
                        <Input
                          id={`eq-damage-${i}`}
                          type="text"
                          value={eq.damage}
                          onChange={(e) =>
                            updateEquipment(i, "damage", e.target.value)
                          }
                        />
                      </Field>
                      <Field id={`eq-desc-${i}`} label="DESCRIPTION">
                        <Input
                          id={`eq-desc-${i}`}
                          type="text"
                          value={eq.description}
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

          {/* Abilities */}
          <Box className={styles.form__box}>
            <PanelTitle
              right={
                <Button type="button" size="sm" onClick={addAbility}>
                  + 추가
                </Button>
              }
            >
              ABILITIES
            </PanelTitle>
            {abilities.length === 0 ? (
              <div className={styles.empty}>어빌리티 없음</div>
            ) : (
              <div className={styles.list}>
                {abilities.map((ab, i) => (
                  <div key={i} className={styles.listItem}>
                    <div className={styles.listItem__head}>
                      <span className={styles.listItem__title}>
                        ABILITY #{i + 1}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => removeAbility(i)}
                      >
                        삭제
                      </Button>
                    </div>
                    <div className={styles.grid}>
                      <Field id={`ab-code-${i}`} label="CODE">
                        <Input
                          id={`ab-code-${i}`}
                          type="text"
                          value={ab.code}
                          onChange={(e) =>
                            updateAbility(i, "code", e.target.value)
                          }
                        />
                      </Field>
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
                      <Field id={`ab-desc-${i}`} label="DESCRIPTION" full>
                        <Input
                          id={`ab-desc-${i}`}
                          type="text"
                          value={ab.description}
                          onChange={(e) =>
                            updateAbility(i, "description", e.target.value)
                          }
                        />
                      </Field>
                      <Field id={`ab-effect-${i}`} label="EFFECT" full>
                        <Input
                          id={`ab-effect-${i}`}
                          type="text"
                          value={ab.effect}
                          onChange={(e) =>
                            updateAbility(i, "effect", e.target.value)
                          }
                        />
                      </Field>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Box>
        </>
      ) : null}

      {/* ── NPC-specific ── */}
      {type === "NPC" ? (
        <Box className={styles.form__box}>
          <PanelTitle>NPC DETAILS</PanelTitle>
          <div className={styles.grid}>
            <Field id="nameEn" label="NAME (EN)" full>
              <Input
                id="nameEn"
                type="text"
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
              />
            </Field>
            <Field id="roleDetail" label="ROLE DETAIL" full>
              <textarea
                id="roleDetail"
                className={styles.textarea}
                value={roleDetail}
                onChange={(e) => setRoleDetail(e.target.value)}
              />
            </Field>
            <Field id="notes" label="NOTES" full>
              <textarea
                id="notes"
                className={styles.textarea}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
          </div>
        </Box>
      ) : null}

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
