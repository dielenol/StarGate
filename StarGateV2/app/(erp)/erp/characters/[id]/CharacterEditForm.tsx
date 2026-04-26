"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import type {
  Ability,
  AgentSheet,
  Character,
  Equipment,
  NpcSheet,
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
 * 'admin' = V+ 모든 필드 편집 가능, 'player' = 본인 캐릭터 서사 7필드만 편집 가능.
 * 'none' 은 폼 진입 자체가 막혀 여기서는 다루지 않음.
 */
type EditMode = "admin" | "player";

interface Props {
  character: Character;
  editMode: EditMode;
  onCancel: () => void;
  onSaved: () => void;
}

/**
 * 플레이어 자가편집에서 허용되는 sheet 필드.
 *
 * ⚠️ 서버 PLAYER_ALLOWED_CHARACTER_FIELDS (`@stargate/shared-db`) 와 sync 필수 (sheet.* prefix 제거형).
 * shared-db 직접 import 시 mongodb transitive 의존이 client 번들에 누수되어 빌드 실패 →
 * 클라 측 hardcoded 유지. drift 검증은 lib/auth/__tests__/character-edit-e2e.test.mjs 의
 * sync 케이스가 담당.
 *
 * 이미지/식별/능력치/소유권은 의도적으로 제외 — 변경 시 GM에 문의하도록 유도.
 */
const PLAYER_EDITABLE_FIELDS = new Set<string>([
  "quote",
  "appearance",
  "personality",
  "background",
  "gender",
  "age",
  "height",
]);

function isPlayerEditable(fieldKey: string): boolean {
  return PLAYER_EDITABLE_FIELDS.has(fieldKey);
}

/* ── P7: client-side diff (lib/character/diff.ts 와 동일 시멘틱) ──
   서버 round-trip 없이 form state ↔ character props 비교.
   shared-db 의 mongodb transitive 의존을 피하려고 hardcoded 한 inline 구현.
   변경 시 lib/character/diff.ts 도 함께 수정 (S6-1 처럼 sync 필수 위치는 아니지만
   diff 결과가 server audit 와 의미상 일치해야 사용자 기대 부합). */
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
   - player: PLAYER_EDITABLE_FIELDS 7개에 'sheet.' prefix 부착 (서버 화이트리스트와 정합)
   - admin: ADMIN_ALLOWED_CHARACTER_FIELDS 와 동일한 dot path 집합
     (shared-db hardcoded 미러 — 서버 truth 는 buildUpdatePatch 가 담당, 본 set 은 UI 미리보기 전용) */
const PLAYER_DIFF_FIELDS: ReadonlyArray<string> = [
  "sheet.quote",
  "sheet.appearance",
  "sheet.personality",
  "sheet.background",
  "sheet.gender",
  "sheet.age",
  "sheet.height",
];

const ADMIN_DIFF_FIELDS: ReadonlyArray<string> = [
  "codename",
  "role",
  "isPublic",
  "previewImage",
  "ownerId",
  "sheet.codename",
  "sheet.name",
  "sheet.mainImage",
  "sheet.posterImage",
  "sheet.quote",
  "sheet.gender",
  "sheet.age",
  "sheet.height",
  "sheet.appearance",
  "sheet.personality",
  "sheet.background",
  // AGENT
  "sheet.weight",
  "sheet.className",
  "sheet.hp",
  "sheet.san",
  "sheet.def",
  "sheet.atk",
  "sheet.abilityType",
  "sheet.credit",
  "sheet.weaponTraining",
  "sheet.skillTraining",
  "sheet.equipment",
  "sheet.abilities",
  // NPC
  "sheet.nameEn",
  "sheet.roleDetail",
  "sheet.notes",
];

/* ── Default factories ── */

function emptyEquipment(): Equipment {
  return { name: "", price: "", damage: "", description: "" };
}

function emptyAbility(): Ability {
  return { code: "", name: "", description: "", effect: "" };
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

  /**
   * 편집 쿼터 조회 — player 모드에서만 활성화. admin 은 쿨다운 미적용이라 폴링 불필요.
   * 응답 도착 전엔 quotaData 가 undefined → 배너 텍스트 보강 영역만 비어 보임.
   */
  const { data: quotaData } = useCharacterEditQuota(characterId, isPlayer);

  /**
   * 플레이어 모드에서 비활성화 여부 판정.
   * - admin 모드면 항상 false (잠금 없음)
   * - player 모드면 PLAYER_EDITABLE_FIELDS 외 모든 필드 잠금
   *
   * Field 컴포넌트의 `locked` prop과 입력 컨트롤의 `disabled` prop 양쪽에 같은 값 사용.
   */
  function isLocked(fieldKey: string): boolean {
    return isPlayer && !isPlayerEditable(fieldKey);
  }

  /* ── Common fields ── */
  const [codename, setCodename] = useState(character.codename);
  const [role, setRole] = useState(character.role);
  const [previewImage, setPreviewImage] = useState(character.previewImage);
  const [isPublic, setIsPublic] = useState(character.isPublic);
  const [ownerId, setOwnerId] = useState(character.ownerId ?? "");

  /* ── Sheet common ── */
  const [name, setName] = useState(character.sheet.name);
  const [mainImage, setMainImage] = useState(character.sheet.mainImage);
  const [posterImage, setPosterImage] = useState(
    character.sheet.posterImage ?? "",
  );
  const [quote, setQuote] = useState(character.sheet.quote);
  const [gender, setGender] = useState(character.sheet.gender);
  const [age, setAge] = useState(character.sheet.age);
  const [height, setHeight] = useState(character.sheet.height);
  const [appearance, setAppearance] = useState(character.sheet.appearance);
  const [personality, setPersonality] = useState(character.sheet.personality);
  const [background, setBackground] = useState(character.sheet.background);

  /* ── Agent-specific ── */
  const agentSheet = character.type === "AGENT" ? character.sheet : null;

  const [weight, setWeight] = useState(agentSheet?.weight ?? "");
  const [className, setClassName] = useState(agentSheet?.className ?? "");
  const [hp, setHp] = useState(agentSheet?.hp ?? 0);
  const [san, setSan] = useState(agentSheet?.san ?? 0);
  const [def, setDef] = useState(agentSheet?.def ?? 0);
  const [atk, setAtk] = useState(agentSheet?.atk ?? 0);
  const [abilityType, setAbilityType] = useState(agentSheet?.abilityType ?? "");
  const [credit, setCredit] = useState(String(agentSheet?.credit ?? ""));
  const [weaponTraining, setWeaponTraining] = useState(
    agentSheet?.weaponTraining ?? "",
  );
  const [skillTraining, setSkillTraining] = useState(
    agentSheet?.skillTraining ?? "",
  );
  const [equipment, setEquipment] = useState<Equipment[]>(
    agentSheet?.equipment ?? [],
  );
  const [abilities, setAbilities] = useState<Ability[]>(
    agentSheet?.abilities ?? [],
  );

  /* ── NPC-specific ── */
  const npcSheet = character.type === "NPC" ? character.sheet : null;

  const [nameEn, setNameEn] = useState(npcSheet?.nameEn ?? "");
  const [roleDetail, setRoleDetail] = useState(npcSheet?.roleDetail ?? "");
  const [notes, setNotes] = useState(npcSheet?.notes ?? "");

  /* ── Form state ── */
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ── P7: diff 프리뷰 모달 상태 ── */
  /**
   * pendingBody / pendingDiff 는 confirm 시점에 그대로 PATCH 에 투입.
   * handleSubmit 에서 한 번 빌드 후 모달이 닫힐 때까지 보관 — confirm 시 reason 만 합쳐 전송.
   * 모달 cancel 시 둘 다 null 로 리셋.
   */
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

  /**
   * 현재 form state 로 PATCH body 를 빌드. handleSubmit 과 모달 confirm 양쪽에서 공유.
   * 모드별 형식:
   *  - player: sheet 부분객체 7필드만
   *  - admin: 기존 (최상위 메타 + sheet 통째)
   */
  function buildBody(): Record<string, unknown> {
    if (isPlayer) {
      return {
        sheet: {
          quote,
          appearance,
          personality,
          background,
          gender,
          age,
          height,
        },
      };
    }

    const sheetBase = {
      codename,
      name,
      mainImage,
      posterImage,
      quote,
      gender,
      age,
      height,
      appearance,
      personality,
      background,
    };

    let sheet: AgentSheet | NpcSheet;

    if (character.type === "AGENT") {
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

    return {
      codename,
      role,
      previewImage,
      isPublic,
      ownerId: ownerId || null,
      sheet,
    };
  }

  /**
   * 클라이언트 측 diff 계산 — 서버 round-trip 없이 form state ↔ character props 비교.
   * isPlayer 면 7필드만, admin 이면 ADMIN_DIFF_FIELDS 전체.
   * AGENT/NPC 무관하게 ADMIN_DIFF_FIELDS 를 모두 비교 — getPathValue 가 undefined 일 땐
   * before/after 가 동일 undefined 라 diff 에 남지 않음 (해당 타입에 없는 필드는 자동 무시).
   */
  function computeFormDiff(): DiffEntry[] {
    const fields = isPlayer ? PLAYER_DIFF_FIELDS : ADMIN_DIFF_FIELDS;

    // form state 를 character 동형 구조로 재구성 — buildBody 의 결과를 그대로 사용하면
    // player 모드에서 admin 필드(ownerId 등) 가 누락되어 비교 시 잘못 'undefined' 처리됨.
    // 대신 character 구조와 같은 형태의 candidate 를 직접 빌드.
    // 기존 form 은 sheet.codename 도 form codename 으로 set 하므로 동일 값 사용.
    const sheetCandidate: Record<string, unknown> = {
      codename,
      name,
      mainImage,
      posterImage,
      quote,
      gender,
      age,
      height,
      appearance,
      personality,
      background,
    };

    if (character.type === "AGENT") {
      Object.assign(sheetCandidate, {
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
      });
    } else {
      Object.assign(sheetCandidate, {
        nameEn,
        roleDetail,
        notes,
      });
    }

    const candidate = {
      codename,
      role,
      isPublic,
      previewImage,
      ownerId: ownerId || null,
      sheet: sheetCandidate,
    };

    return buildLocalDiff(character, candidate, fields);
  }

  /**
   * 모달 confirm 시 실제 PATCH 수행. handleSubmit 에서도 fallback 으로 사용 (변경 0 케이스).
   * reason 은 선택 — body 에 포함되어 서버 audit 로 흘러간다 (P7-T4).
   */
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
        // 429(쿨다운) 응답은 cooldown 정보를 포함하지만 표시는 단순 메시지로 통일.
        // 쿼터 캐시도 invalidate 해 다음 편집 진입 시 갱신된 used/remaining 표시.
        if (res.status === 429 && isPlayer) {
          await queryClient.invalidateQueries({
            queryKey: characterEditQuotaKeys.byCharacter(characterId),
          });
        }
        setError(data.error ?? "저장에 실패했습니다.");
        setSubmitting(false);
        // 모달은 닫지 않음 — 사용자가 메시지 확인 후 닫거나 재시도
        return;
      }

      // PATCH 성공 — player 모드면 used 카운트가 +1 되었으므로 quota 캐시 invalidate.
      if (isPlayer) {
        await queryClient.invalidateQueries({
          queryKey: characterEditQuotaKeys.byCharacter(characterId),
        });
      }

      // 성공 — 모달 닫고 상위 콜백 호출
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

  /* ── Submit ── */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setError(null);

    const diff = computeFormDiff();
    if (diff.length === 0) {
      // 변경 없음 — 모달 띄우지 않고 안내만
      setError("변경 사항이 없습니다.");
      return;
    }

    // diff 가 있으면 모달 열기. 실제 PATCH 는 confirm 시 performPatch.
    setPendingDiff(diff);
    setPendingBody(buildBody());
    setPreviewOpen(true);
  }

  function handlePreviewConfirm(reason?: string) {
    if (!pendingBody) return;
    void performPatch(pendingBody, reason);
  }

  function handlePreviewCancel() {
    if (submitting) return; // PATCH 진행 중엔 닫지 못함 — 응답 도착 후 자동 처리
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
              ? "서사 필드만 수정 가능합니다 (능력치 · 이미지는 GM 문의)."
              : "모든 필드를 수정할 수 있습니다."}
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

      {/* ── Common Fields ── */}
      <div className={styles.form__box}>
        <div className={styles.panelTitle}>
          <span className={styles.panelTitle__label}>BASIC INFO</span>
        </div>
        <div className={styles.form__box__body}>
          <div className={styles.grid}>
            <Field id="codename" label="CODENAME" locked={isLocked("codename")}>
              <input
                id="codename"
                type="text"
                className={styles.input}
                value={codename}
                onChange={(e) => setCodename(e.target.value)}
                required={!isLocked("codename")}
                disabled={isLocked("codename")}
              />
            </Field>
            <Field id="role" label="ROLE" locked={isLocked("role")}>
              <input
                id="role"
                type="text"
                className={styles.input}
                value={role}
                onChange={(e) => setRole(e.target.value)}
                required={!isLocked("role")}
                disabled={isLocked("role")}
              />
            </Field>
            <Field id="name" label="NAME" locked={isLocked("name")}>
              <input
                id="name"
                type="text"
                className={styles.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isLocked("name")}
              />
            </Field>
            <Field id="ownerId" label="OWNER ID" locked={isLocked("ownerId")}>
              <input
                id="ownerId"
                type="text"
                className={styles.input}
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                placeholder="소유자 ID (선택)"
                disabled={isLocked("ownerId")}
              />
            </Field>
            <Field
              id="previewImage"
              label="PREVIEW IMAGE URL"
              full
              locked={isLocked("previewImage")}
            >
              <input
                id="previewImage"
                type="text"
                className={styles.input}
                value={previewImage}
                onChange={(e) => setPreviewImage(e.target.value)}
                placeholder="미리보기 이미지 URL"
                disabled={isLocked("previewImage")}
              />
            </Field>
            <Field
              id="mainImage"
              label="MAIN IMAGE URL"
              full
              locked={isLocked("mainImage")}
            >
              <input
                id="mainImage"
                type="text"
                className={styles.input}
                value={mainImage}
                onChange={(e) => setMainImage(e.target.value)}
                placeholder="메인 이미지 URL (세로 초상화)"
                disabled={isLocked("mainImage")}
              />
            </Field>
            <Field
              id="posterImage"
              label="POSTER IMAGE URL"
              full
              locked={isLocked("posterImage")}
            >
              <input
                id="posterImage"
                type="text"
                className={styles.input}
                value={posterImage}
                onChange={(e) => setPosterImage(e.target.value)}
                placeholder="캐릭터 상세 상단 와이드 히어로 (선택)"
                disabled={isLocked("posterImage")}
              />
            </Field>
            <div className={`${styles.field} ${styles["field--full"]}`}>
              <label
                className={[
                  styles.checkbox,
                  isLocked("isPublic") ? styles["checkbox--locked"] : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  className={styles.checkbox__input}
                  disabled={isLocked("isPublic")}
                />
                <span className={styles.checkbox__text}>공개 캐릭터</span>
                {isLocked("isPublic") ? (
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

      {/* ── Sheet Common ── */}
      {/*
        이 섹션의 7개 필드(quote/gender/age/height/appearance/personality/background)는
        PLAYER_ALLOWED_CHARACTER_FIELDS와 정확히 일치 — player 모드에서도 모두 편집 가능.
        잠금은 isLocked 헬퍼가 알아서 false 반환.
      */}
      <div className={styles.form__box}>
        <div className={styles.panelTitle}>
          <span className={styles.panelTitle__label}>CHARACTER PROFILE</span>
        </div>
        <div className={styles.form__box__body}>
          <div className={styles.grid}>
            <Field id="quote" label="QUOTE" locked={isLocked("quote")}>
              <input
                id="quote"
                type="text"
                className={styles.input}
                value={quote}
                onChange={(e) => setQuote(e.target.value)}
                disabled={isLocked("quote")}
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

      {/*
        ── Agent-specific (admin only) ──
        능력치/장비/어빌리티는 PLAYER_ALLOWED_CHARACTER_FIELDS 에 미포함이므로
        player 모드에서는 섹션 자체를 비표시. 입력해도 서버 화이트리스트에서 drop 되며,
        UI에서 잠긴 상태로 노출하면 시각적 잡음만 늘어 사용자 인지 부하 증가.
      */}
      {character.type === "AGENT" && !isPlayer ? (
        <>
          <div className={styles.form__box}>
            <div className={styles.panelTitle}>
              <span className={styles.panelTitle__label}>COMBAT STATS</span>
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
                <Field id="san" label="SAN">
                  <input
                    id="san"
                    type="number"
                    className={`${styles.input} ${styles["input--num"]}`}
                    value={san}
                    onChange={(e) => setSan(Number(e.target.value))}
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
                <Field id="atk" label="ATK">
                  <input
                    id="atk"
                    type="number"
                    className={`${styles.input} ${styles["input--num"]}`}
                    value={atk}
                    onChange={(e) => setAtk(Number(e.target.value))}
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
                <Field id="weight" label="WEIGHT">
                  <input
                    id="weight"
                    type="text"
                    className={styles.input}
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
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
                <Field id="weaponTraining" label="WEAPON TRAINING">
                  <input
                    id="weaponTraining"
                    type="text"
                    className={styles.input}
                    value={weaponTraining}
                    onChange={(e) => setWeaponTraining(e.target.value)}
                  />
                </Field>
                <Field id="skillTraining" label="SKILL TRAINING">
                  <input
                    id="skillTraining"
                    type="text"
                    className={styles.input}
                    value={skillTraining}
                    onChange={(e) => setSkillTraining(e.target.value)}
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
                              value={String(eq.price)}
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
                              value={eq.damage}
                              onChange={(e) =>
                                updateEquipment(i, "damage", e.target.value)
                              }
                            />
                          </Field>
                          <Field id={`eq-desc-${i}`} label="DESCRIPTION">
                            <input
                              id={`eq-desc-${i}`}
                              type="text"
                              className={styles.input}
                              value={eq.description}
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

          {/* Abilities list */}
          <div className={styles.form__box}>
            <div className={styles.panelTitle}>
              <span className={styles.panelTitle__label}>ABILITIES</span>
              <div className={styles.panelTitle__right}>
                <button
                  type="button"
                  className={`${styles.ghostBtn} ${styles["ghostBtn--add"]}`}
                  onClick={addAbility}
                >
                  추가
                </button>
              </div>
            </div>
            <div className={styles.form__box__body}>
              {abilities.length === 0 ? (
                <div className={styles.empty}>어빌리티 없음</div>
              ) : (
                <div className={styles.list}>
                  {abilities.map((ab, i) => (
                    <div key={i} className={styles.listItem}>
                      <div className={styles.listItem__head}>
                        <span className={styles.listItem__title}>
                          ABILITY <b>#{String(i + 1).padStart(2, "0")}</b>
                        </span>
                        <button
                          type="button"
                          className={`${styles.ghostBtn} ${styles["ghostBtn--remove"]}`}
                          onClick={() => removeAbility(i)}
                        >
                          삭제
                        </button>
                      </div>
                      <div className={styles.listItem__body}>
                        <div className={styles.grid}>
                          <Field id={`ab-code-${i}`} label="CODE">
                            <input
                              id={`ab-code-${i}`}
                              type="text"
                              className={styles.input}
                              value={ab.code}
                              onChange={(e) =>
                                updateAbility(i, "code", e.target.value)
                              }
                            />
                          </Field>
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
                          <Field id={`ab-desc-${i}`} label="DESCRIPTION" full>
                            <input
                              id={`ab-desc-${i}`}
                              type="text"
                              className={styles.input}
                              value={ab.description}
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
                              value={ab.effect}
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
              )}
            </div>
          </div>
        </>
      ) : null}

      {/* ── NPC-specific (admin only) — NPC 전용 필드는 PLAYER_ALLOWED 외 ── */}
      {character.type === "NPC" && !isPlayer ? (
        <div className={styles.form__box}>
          <div className={styles.panelTitle}>
            <span className={styles.panelTitle__label}>NPC DETAILS</span>
          </div>
          <div className={styles.form__box__body}>
            <div className={styles.grid}>
              <Field id="nameEn" label="NAME (EN)" full>
                <input
                  id="nameEn"
                  type="text"
                  className={styles.input}
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
          </div>
        </div>
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

      {/* ── P7: diff 프리뷰 모달 ── */}
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
            character.sheet.name && character.sheet.name !== character.codename
              ? `${character.sheet.name} / ${character.codename}`
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
