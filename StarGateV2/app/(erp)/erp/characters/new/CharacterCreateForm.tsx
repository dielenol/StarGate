"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type {
  CharacterType,
  AgentLevel,
  AgentSheet,
  NpcSheet,
  Equipment,
  Ability,
} from "@/types/character";
import { AGENT_LEVELS, AGENT_LEVEL_LABELS, DEPARTMENTS } from "@/types/character";

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
      <div className={styles.form__section}>
        <div className={styles.form__sectionHeader}>CHARACTER TYPE</div>
        <div className={styles.form__card}>
          <div className={styles.form__field}>
            <label className={styles.form__label} htmlFor="type">
              TYPE
            </label>
            <select
              id="type"
              className={styles.form__select}
              value={type}
              onChange={(e) => setType(e.target.value as CharacterType)}
            >
              <option value="AGENT">AGENT</option>
              <option value="NPC">NPC</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Common Fields ── */}
      <div className={styles.form__section}>
        <div className={styles.form__sectionHeader}>BASIC INFO</div>
        <div className={styles.form__card}>
          <div className={styles.form__grid}>
            <div className={styles.form__field}>
              <label className={styles.form__label} htmlFor="codename">
                CODENAME
              </label>
              <input
                id="codename"
                className={styles.form__input}
                type="text"
                value={codename}
                onChange={(e) => setCodename(e.target.value)}
                required
              />
            </div>
            <div className={styles.form__field}>
              <label className={styles.form__label} htmlFor="role">
                ROLE
              </label>
              <input
                id="role"
                className={styles.form__input}
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                required
              />
            </div>
            <div className={styles.form__field}>
              <label className={styles.form__label} htmlFor="agentLevel">
                AGENT LEVEL
              </label>
              <select
                id="agentLevel"
                className={styles.form__select}
                value={agentLevel}
                onChange={(e) => setAgentLevel(e.target.value as AgentLevel)}
              >
                {AGENT_LEVELS.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {lvl} — {AGENT_LEVEL_LABELS[lvl]}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.form__field}>
              <label className={styles.form__label} htmlFor="department">
                DEPARTMENT
              </label>
              <select
                id="department"
                className={styles.form__select}
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
              >
                {DEPARTMENTS.map((dept) => (
                  <option key={dept.code} value={dept.code}>
                    {dept.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.form__field}>
              <label className={styles.form__label} htmlFor="name">
                NAME
              </label>
              <input
                id="name"
                className={styles.form__input}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className={styles.form__field}>
              <label className={styles.form__label} htmlFor="ownerId">
                OWNER ID
              </label>
              <input
                id="ownerId"
                className={styles.form__input}
                type="text"
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                placeholder="소유자 ID (선택)"
              />
            </div>
            <div className={`${styles.form__field} ${styles.form__gridFull}`}>
              <label className={styles.form__label} htmlFor="previewImage">
                PREVIEW IMAGE URL
              </label>
              <input
                id="previewImage"
                className={styles.form__input}
                type="text"
                value={previewImage}
                onChange={(e) => setPreviewImage(e.target.value)}
                placeholder="미리보기 이미지 URL"
              />
            </div>
            <div className={`${styles.form__field} ${styles.form__gridFull}`}>
              <label className={styles.form__label} htmlFor="mainImage">
                MAIN IMAGE URL
              </label>
              <input
                id="mainImage"
                className={styles.form__input}
                type="text"
                value={mainImage}
                onChange={(e) => setMainImage(e.target.value)}
                placeholder="메인 이미지 URL"
              />
            </div>
            <div className={`${styles.form__field} ${styles.form__gridFull}`}>
              <div className={styles.form__checkbox}>
                <input
                  id="isPublic"
                  className={styles.form__checkboxInput}
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                />
                <label
                  className={styles.form__checkboxLabel}
                  htmlFor="isPublic"
                >
                  공개 캐릭터
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Sheet Common ── */}
      <div className={styles.form__section}>
        <div className={styles.form__sectionHeader}>CHARACTER PROFILE</div>
        <div className={styles.form__card}>
          <div className={styles.form__grid}>
            <div className={styles.form__field}>
              <label className={styles.form__label} htmlFor="quote">
                QUOTE
              </label>
              <input
                id="quote"
                className={styles.form__input}
                type="text"
                value={quote}
                onChange={(e) => setQuote(e.target.value)}
              />
            </div>
            <div className={styles.form__field}>
              <label className={styles.form__label} htmlFor="gender">
                GENDER
              </label>
              <input
                id="gender"
                className={styles.form__input}
                type="text"
                value={gender}
                onChange={(e) => setGender(e.target.value)}
              />
            </div>
            <div className={styles.form__field}>
              <label className={styles.form__label} htmlFor="age">
                AGE
              </label>
              <input
                id="age"
                className={styles.form__input}
                type="text"
                value={age}
                onChange={(e) => setAge(e.target.value)}
              />
            </div>
            <div className={styles.form__field}>
              <label className={styles.form__label} htmlFor="height">
                HEIGHT
              </label>
              <input
                id="height"
                className={styles.form__input}
                type="text"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
              />
            </div>
            <div className={`${styles.form__field} ${styles.form__gridFull}`}>
              <label className={styles.form__label} htmlFor="appearance">
                외모
              </label>
              <textarea
                id="appearance"
                className={styles.form__textarea}
                value={appearance}
                onChange={(e) => setAppearance(e.target.value)}
              />
            </div>
            <div className={`${styles.form__field} ${styles.form__gridFull}`}>
              <label className={styles.form__label} htmlFor="personality">
                성격
              </label>
              <textarea
                id="personality"
                className={styles.form__textarea}
                value={personality}
                onChange={(e) => setPersonality(e.target.value)}
              />
            </div>
            <div className={`${styles.form__field} ${styles.form__gridFull}`}>
              <label className={styles.form__label} htmlFor="background">
                배경
              </label>
              <textarea
                id="background"
                className={styles.form__textarea}
                value={background}
                onChange={(e) => setBackground(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Agent-specific ── */}
      {type === "AGENT" && (
        <>
          <div className={styles.form__section}>
            <div className={styles.form__sectionHeader}>COMBAT STATS</div>
            <div className={styles.form__card}>
              <div className={styles.form__statGrid}>
                <div className={styles.form__field}>
                  <label className={styles.form__label} htmlFor="hp">HP</label>
                  <input id="hp" className={styles.form__input} type="number" value={hp} onChange={(e) => setHp(Number(e.target.value))} />
                </div>
                <div className={styles.form__field}>
                  <label className={styles.form__label} htmlFor="san">SAN</label>
                  <input id="san" className={styles.form__input} type="number" value={san} onChange={(e) => setSan(Number(e.target.value))} />
                </div>
                <div className={styles.form__field}>
                  <label className={styles.form__label} htmlFor="def">DEF</label>
                  <input id="def" className={styles.form__input} type="number" value={def} onChange={(e) => setDef(Number(e.target.value))} />
                </div>
                <div className={styles.form__field}>
                  <label className={styles.form__label} htmlFor="atk">ATK</label>
                  <input id="atk" className={styles.form__input} type="number" value={atk} onChange={(e) => setAtk(Number(e.target.value))} />
                </div>
              </div>
            </div>
          </div>

          <div className={styles.form__section}>
            <div className={styles.form__sectionHeader}>AGENT DETAILS</div>
            <div className={styles.form__card}>
              <div className={styles.form__grid}>
                <div className={styles.form__field}>
                  <label className={styles.form__label} htmlFor="className">CLASS</label>
                  <input id="className" className={styles.form__input} type="text" value={className} onChange={(e) => setClassName(e.target.value)} />
                </div>
                <div className={styles.form__field}>
                  <label className={styles.form__label} htmlFor="weight">WEIGHT</label>
                  <input id="weight" className={styles.form__input} type="text" value={weight} onChange={(e) => setWeight(e.target.value)} />
                </div>
                <div className={styles.form__field}>
                  <label className={styles.form__label} htmlFor="abilityType">ABILITY TYPE</label>
                  <input id="abilityType" className={styles.form__input} type="text" value={abilityType} onChange={(e) => setAbilityType(e.target.value)} />
                </div>
                <div className={styles.form__field}>
                  <label className={styles.form__label} htmlFor="credit">CREDIT</label>
                  <input id="credit" className={styles.form__input} type="text" value={credit} onChange={(e) => setCredit(e.target.value)} />
                </div>
                <div className={styles.form__field}>
                  <label className={styles.form__label} htmlFor="weaponTraining">WEAPON TRAINING</label>
                  <input id="weaponTraining" className={styles.form__input} type="text" value={weaponTraining} onChange={(e) => setWeaponTraining(e.target.value)} />
                </div>
                <div className={styles.form__field}>
                  <label className={styles.form__label} htmlFor="skillTraining">SKILL TRAINING</label>
                  <input id="skillTraining" className={styles.form__input} type="text" value={skillTraining} onChange={(e) => setSkillTraining(e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          {/* Equipment */}
          <div className={styles.form__section}>
            <div className={styles.form__listHeader}>
              <div className={styles.form__sectionHeader}>EQUIPMENT</div>
              <button type="button" className={styles.form__addBtn} onClick={addEquipment}>+ 추가</button>
            </div>
            {equipment.map((eq, i) => (
              <div key={i} className={styles.form__listItem}>
                <div className={styles.form__listItemHeader}>
                  <span className={styles.form__listItemTitle}>ITEM #{i + 1}</span>
                  <button type="button" className={styles.form__removeBtn} onClick={() => removeEquipment(i)}>삭제</button>
                </div>
                <div className={styles.form__grid}>
                  <div className={styles.form__field}>
                    <label className={styles.form__label}>NAME</label>
                    <input className={styles.form__input} type="text" value={eq.name} onChange={(e) => updateEquipment(i, "name", e.target.value)} />
                  </div>
                  <div className={styles.form__field}>
                    <label className={styles.form__label}>PRICE</label>
                    <input className={styles.form__input} type="text" value={String(eq.price)} onChange={(e) => updateEquipment(i, "price", e.target.value)} />
                  </div>
                  <div className={styles.form__field}>
                    <label className={styles.form__label}>DAMAGE</label>
                    <input className={styles.form__input} type="text" value={eq.damage} onChange={(e) => updateEquipment(i, "damage", e.target.value)} />
                  </div>
                  <div className={styles.form__field}>
                    <label className={styles.form__label}>DESCRIPTION</label>
                    <input className={styles.form__input} type="text" value={eq.description} onChange={(e) => updateEquipment(i, "description", e.target.value)} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Abilities */}
          <div className={styles.form__section}>
            <div className={styles.form__listHeader}>
              <div className={styles.form__sectionHeader}>ABILITIES</div>
              <button type="button" className={styles.form__addBtn} onClick={addAbility}>+ 추가</button>
            </div>
            {abilities.map((ab, i) => (
              <div key={i} className={styles.form__listItem}>
                <div className={styles.form__listItemHeader}>
                  <span className={styles.form__listItemTitle}>ABILITY #{i + 1}</span>
                  <button type="button" className={styles.form__removeBtn} onClick={() => removeAbility(i)}>삭제</button>
                </div>
                <div className={styles.form__grid}>
                  <div className={styles.form__field}>
                    <label className={styles.form__label}>CODE</label>
                    <input className={styles.form__input} type="text" value={ab.code} onChange={(e) => updateAbility(i, "code", e.target.value)} />
                  </div>
                  <div className={styles.form__field}>
                    <label className={styles.form__label}>NAME</label>
                    <input className={styles.form__input} type="text" value={ab.name} onChange={(e) => updateAbility(i, "name", e.target.value)} />
                  </div>
                  <div className={`${styles.form__field} ${styles.form__gridFull}`}>
                    <label className={styles.form__label}>DESCRIPTION</label>
                    <input className={styles.form__input} type="text" value={ab.description} onChange={(e) => updateAbility(i, "description", e.target.value)} />
                  </div>
                  <div className={`${styles.form__field} ${styles.form__gridFull}`}>
                    <label className={styles.form__label}>EFFECT</label>
                    <input className={styles.form__input} type="text" value={ab.effect} onChange={(e) => updateAbility(i, "effect", e.target.value)} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── NPC-specific ── */}
      {type === "NPC" && (
        <div className={styles.form__section}>
          <div className={styles.form__sectionHeader}>NPC DETAILS</div>
          <div className={styles.form__card}>
            <div className={styles.form__grid}>
              <div className={`${styles.form__field} ${styles.form__gridFull}`}>
                <label className={styles.form__label} htmlFor="nameEn">NAME (EN)</label>
                <input id="nameEn" className={styles.form__input} type="text" value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
              </div>
              <div className={`${styles.form__field} ${styles.form__gridFull}`}>
                <label className={styles.form__label} htmlFor="roleDetail">ROLE DETAIL</label>
                <textarea id="roleDetail" className={styles.form__textarea} value={roleDetail} onChange={(e) => setRoleDetail(e.target.value)} />
              </div>
              <div className={`${styles.form__field} ${styles.form__gridFull}`}>
                <label className={styles.form__label} htmlFor="notes">NOTES</label>
                <textarea id="notes" className={styles.form__textarea} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Actions ── */}
      {error && <div className={styles.form__error}>{error}</div>}

      <div className={styles.form__actions}>
        <button
          type="submit"
          className={styles.form__submit}
          disabled={submitting}
        >
          {submitting ? "생성 중..." : "캐릭터 생성"}
        </button>
        <a href="/erp/characters" className={styles.form__cancel}>
          취소
        </a>
      </div>
    </form>
  );
}
