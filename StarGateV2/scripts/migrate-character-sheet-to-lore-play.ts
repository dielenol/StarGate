/**
 * characters 컬렉션 sheet → lore + play sub-document 분리 마이그레이션
 *
 * Phase 1 에서 도입된 신 스키마(LoreSheet/PlaySheet) 로 기존 도큐먼트를 옮긴다.
 * AGENT/NPC 공통: sheet → lore (인물 신상/서사/이미지/메타)
 * AGENT 전용:   sheet → play (게임 시트 능력치/장비/어빌리티)
 *
 * 사용법 (opt-in 쓰기 모드):
 *   pnpm run migrate:character-sheet                                # dry-run (기본, DB 읽기만)
 *   pnpm run migrate:character-sheet -- --execute --yes             # 실제 쓰기 (명시적 2-플래그)
 *   pnpm run migrate:character-sheet -- --execute --yes --verbose   # 실제 쓰기 + 변환 페이로드 출력
 *
 * --execute 단독으로는 실행 거부 (--yes 누락 시 exit 1).
 *
 * 환경변수: MONGODB_URI (실행 시 필수, dry-run 은 .env.local 부재면 계획만 출력)
 *
 * 실행 도구: `node --experimental-strip-types` (Node 22.6+, seed-factions/seed-institutions 와 동일).
 *
 * Idempotency:
 *   - lore 가 이미 있고 sheet 가 부재 → skip
 *   - lore 가 있고 sheet 도 있음(부분 마이그레이션) → sheet $unset 만 수행, lore 보존
 *   - lore 가 없음 → 정식 변환
 *   재실행 안전. 같은 도큐먼트를 여러 번 돌려도 결과 동일.
 *
 * 작업 후 invariant 검증:
 *   - 모든 도큐먼트가 lore 보유
 *   - AGENT 는 play 보유, NPC 는 play 부재
 *   - 어떤 도큐먼트도 sheet 필드를 보유하지 않음
 *   - lore.weight 가 string 타입
 *   - AGENT.play.weaponTraining/skillTraining 이 배열
 *   - AGENT.play.abilities[i].slot 이 모두 정의됨
 *   위반 시 stderr 출력 후 exit 1.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import {
  type AbilitySlot,
  getClient,
  initServerless,
} from "@stargate/shared-db";

/* ── .env.local 로드 ──
   `=== undefined` 체크로 빈 문자열("")을 unset 취급하지 않도록 방어. */

const envPath = resolve(process.cwd(), ".env.local");
try {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx);
    const val = trimmed.slice(eqIdx + 1);
    if (process.env[key] === undefined) process.env[key] = val;
  }
} catch {
  // .env.local 부재 — dry-run 은 계속 진행
}

/* ── CLI 플래그 ──
   기본: dry-run. 실제 실행은 --execute + --yes 2개 모두 필요. */

const EXECUTE = process.argv.includes("--execute");
const YES = process.argv.includes("--yes");
const DRY_RUN = !EXECUTE;
const VERBOSE = process.argv.includes("--verbose") || process.argv.includes("-v");

if (EXECUTE && !YES) {
  console.error(
    "[migrate-character-sheet] --execute 시 --yes 로 명시적 확인이 필요합니다.",
  );
  console.error(
    "  실제 쓰기: pnpm run migrate:character-sheet -- --execute --yes",
  );
  console.error("  dry-run 기본: pnpm run migrate:character-sheet");
  process.exit(1);
}

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME ?? "stargate";

if (EXECUTE && MONGODB_URI) {
  try {
    const host = new URL(MONGODB_URI).host;
    console.log(`[migrate-character-sheet] WRITE 대상 호스트: ${host}`);
  } catch {
    console.log(
      "[migrate-character-sheet] WRITE 모드 (MONGODB_URI 호스트 파싱 실패)",
    );
  }
}

/* ── 상수 ── */

/** 어빌리티 인덱스 → slot 매핑 (legacy 데이터 호환). */
const ABILITY_SLOT_BY_INDEX: readonly AbilitySlot[] = [
  "C1",
  "C2",
  "C3",
  "P",
  "A1",
  "A2",
  "A3",
] as const;

/** 길이 7 고정. */
const ABILITY_SLOT_COUNT = ABILITY_SLOT_BY_INDEX.length;

/** lore sub-document 으로 옮기는 sheet 키 (AGENT/NPC 공통). 문서화 목적 상수. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const SHEET_TO_LORE_KEYS = [
  "name",
  "gender",
  "age",
  "height",
  "appearance",
  "personality",
  "background",
  "quote",
  "mainImage",
  "posterImage",
  // NPC 호환 필드
  "nameNative",
  "nickname",
  "nameEn",
  "roleDetail",
  "notes",
] as const;

/** play sub-document 으로 옮기는 sheet 키 (AGENT 전용). 문서화 목적 상수. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const SHEET_TO_PLAY_KEYS = [
  "className",
  "hp",
  "san",
  "def",
  "atk",
  "credit",
  "abilityType",
  "equipment",
] as const;

/** root → lore 로 이동시키는 메타 키 (NPC 위주). */
const ROOT_TO_LORE_META_KEYS = ["loreTags", "appearsInEvents"] as const;

/* ── 타입 ── */

type CharacterType = "AGENT" | "NPC";

interface LegacyEquipment {
  name?: unknown;
  price?: unknown;
  damage?: unknown;
  ammo?: unknown;
  grip?: unknown;
  description?: unknown;
}

interface LegacyAbility {
  slot?: unknown;
  name?: unknown;
  code?: unknown;
  description?: unknown;
  effect?: unknown;
}

/** 마이그레이션 전 도큐먼트의 느슨한 형태. 모든 필드 optional / unknown. */
interface LegacyCharacterDoc {
  _id: unknown;
  codename: string;
  type: CharacterType;
  sheet?: Record<string, unknown>;
  lore?: Record<string, unknown>;
  play?: Record<string, unknown>;
  loreTags?: unknown;
  appearsInEvents?: unknown;
  factionCode?: unknown;
  institutionCode?: unknown;
  [key: string]: unknown;
}

interface LorePayload {
  name: string;
  gender: string;
  age: string;
  height: string;
  weight: string;
  appearance: string;
  personality: string;
  background: string;
  quote: string;
  mainImage: string;
  posterImage?: string;
  loreTags?: string[];
  appearsInEvents?: string[];
  nameNative?: string;
  nickname?: string;
  nameEn?: string;
  roleDetail?: string;
  notes?: string;
}

interface PlayPayload {
  className: string;
  hp: number;
  hpDelta: number;
  san: number;
  sanDelta: number;
  def: number;
  defDelta: number;
  atk: number;
  atkDelta: number;
  abilityType?: string;
  weaponTraining: string[];
  skillTraining: string[];
  credit: string;
  equipment: LegacyEquipment[];
  abilities: { slot: AbilitySlot; name: string; code?: string; description?: string; effect?: string }[];
}

type PlanAction =
  | "예상 update"
  | "예상 skip"
  | "예상 cleanup-sheet"
  | "update"
  | "skip"
  | "cleanup-sheet";

interface MigrationPlan {
  codename: string;
  type: CharacterType;
  action: PlanAction;
  reason: string;
  /** dry-run/verbose 출력용 — 실제 변환 결과. skip 인 경우 부재. */
  setPayload?: Record<string, unknown>;
  unsetKeys?: string[];
  warnings?: string[];
}

/* ── 유틸 ── */

function asStringOrFallback(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return fallback;
}

function asNumberOrZero(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

/** 문자열 또는 배열을 string[] 으로 정규화. */
function normalizeTrainingField(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter((v) => v !== "");
  }
  if (typeof value !== "string") return [];
  const trimmed = value.trim();
  if (trimmed === "") return [];
  // 쉼표 split — 단일 항목이면 배열 길이 1
  return trimmed
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => v !== "");
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.some((v) => typeof v === "string");
}

function buildExistingLoreRepairPatch(
  doc: LegacyCharacterDoc,
): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  const lore =
    doc.lore !== undefined && doc.lore !== null && typeof doc.lore === "object"
      ? doc.lore
      : {};
  const sheet = (doc.sheet ?? {}) as Record<string, unknown>;

  const requiredStringFields = [
    "name",
    "gender",
    "age",
    "height",
    "weight",
    "appearance",
    "personality",
    "background",
    "quote",
    "mainImage",
  ] as const;

  for (const field of requiredStringFields) {
    if (typeof lore[field] === "string") continue;
    updates[`lore.${field}`] = asStringOrFallback(sheet[field], "");
  }

  for (const key of ROOT_TO_LORE_META_KEYS) {
    const rootValue = normalizeStringArray(doc[key]);
    if (rootValue.length === 0) continue;
    if (isNonEmptyStringArray(lore[key])) continue;
    updates[`lore.${key}`] = rootValue;
  }

  return updates;
}

/**
 * 어빌리티 배열에 slot 자동 할당 + 길이 7 보정.
 *
 * - 이미 모든 항목에 slot 이 있으면 그대로 보존 (길이 7 강제 안 함)
 * - 일부라도 slot 누락 → 인덱스 기반 매핑(C1/C2/C3/P/A1/A2/A3)
 * - 7개 미만 → 부족분 빈 항목 채움
 * - 7개 초과 → 처음 7개만 보존 (warnings 에 기록)
 *
 * @returns { abilities, warnings }
 */
function normalizeAbilities(
  rawAbilities: unknown,
  codename: string,
): { abilities: PlayPayload["abilities"]; warnings: string[] } {
  const warnings: string[] = [];

  if (!Array.isArray(rawAbilities) || rawAbilities.length === 0) {
    // 빈 7슬롯
    return {
      abilities: ABILITY_SLOT_BY_INDEX.map((slot) => ({ slot, name: "" })),
      warnings,
    };
  }

  const sourceList = rawAbilities as LegacyAbility[];
  const allHaveSlot = sourceList.every(
    (a) => typeof a?.slot === "string" && a.slot !== "",
  );

  // 이미 모든 항목에 slot 있음 → 그대로 보존 (길이 7 강제 X)
  if (allHaveSlot) {
    if (sourceList.length > ABILITY_SLOT_COUNT) {
      warnings.push(
        `abilities 길이 ${sourceList.length} > 7 — 처음 ${ABILITY_SLOT_COUNT}개만 보존하고 나머지는 무시 (codename=${codename})`,
      );
    }
    const sliced = sourceList.slice(0, ABILITY_SLOT_COUNT);
    return {
      abilities: sliced.map((a) => ({
        slot: a.slot as AbilitySlot,
        name: asStringOrFallback(a.name, ""),
        ...(typeof a.code === "string" && a.code !== ""
          ? { code: a.code }
          : {}),
        ...(typeof a.description === "string" && a.description !== ""
          ? { description: a.description }
          : {}),
        ...(typeof a.effect === "string" && a.effect !== ""
          ? { effect: a.effect }
          : {}),
      })),
      warnings,
    };
  }

  // 일부 또는 전부 slot 누락 → 인덱스 매핑 (7개 초과는 잘라냄)
  if (sourceList.length > ABILITY_SLOT_COUNT) {
    warnings.push(
      `abilities 길이 ${sourceList.length} > 7 — 처음 ${ABILITY_SLOT_COUNT}개만 보존하고 나머지는 무시 (codename=${codename})`,
    );
  }

  const out: PlayPayload["abilities"] = [];
  for (let i = 0; i < ABILITY_SLOT_COUNT; i += 1) {
    const slot = ABILITY_SLOT_BY_INDEX[i]!;
    const src = sourceList[i];
    if (!src) {
      out.push({ slot, name: "" });
      continue;
    }
    const resolvedSlot =
      typeof src.slot === "string" && src.slot !== ""
        ? (src.slot as AbilitySlot)
        : slot;
    out.push({
      slot: resolvedSlot,
      name: asStringOrFallback(src.name, ""),
      ...(typeof src.code === "string" && src.code !== ""
        ? { code: src.code }
        : {}),
      ...(typeof src.description === "string" && src.description !== ""
        ? { description: src.description }
        : {}),
      ...(typeof src.effect === "string" && src.effect !== ""
        ? { effect: src.effect }
        : {}),
    });
  }

  return { abilities: out, warnings };
}

/* ── lore / play 빌드 ── */

function buildLore(doc: LegacyCharacterDoc): LorePayload {
  const sheet = (doc.sheet ?? {}) as Record<string, unknown>;

  const lore: LorePayload = {
    name: asStringOrFallback(sheet.name),
    gender: asStringOrFallback(sheet.gender),
    age: asStringOrFallback(sheet.age),
    height: asStringOrFallback(sheet.height),
    // weight: AgentSheet 에 weight 가 있으면 사용 (string), 없으면 ""
    weight: asStringOrFallback(sheet.weight, ""),
    appearance: asStringOrFallback(sheet.appearance),
    personality: asStringOrFallback(sheet.personality),
    background: asStringOrFallback(sheet.background),
    quote: asStringOrFallback(sheet.quote),
    mainImage: asStringOrFallback(sheet.mainImage),
  };

  // optional 필드 — 존재할 때만 포함
  if (typeof sheet.posterImage === "string" && sheet.posterImage !== "") {
    lore.posterImage = sheet.posterImage;
  }
  if (typeof sheet.nameNative === "string" && sheet.nameNative !== "") {
    lore.nameNative = sheet.nameNative;
  }
  if (typeof sheet.nickname === "string" && sheet.nickname !== "") {
    lore.nickname = sheet.nickname;
  }
  if (typeof sheet.nameEn === "string" && sheet.nameEn !== "") {
    lore.nameEn = sheet.nameEn;
  }
  if (typeof sheet.roleDetail === "string" && sheet.roleDetail !== "") {
    lore.roleDetail = sheet.roleDetail;
  }
  if (typeof sheet.notes === "string" && sheet.notes !== "") {
    lore.notes = sheet.notes;
  }

  // root 의 메타 필드 → lore 로 승격 (NPC 위주)
  const loreTags = normalizeStringArray(doc.loreTags);
  if (loreTags.length > 0) lore.loreTags = loreTags;
  const appearsIn = normalizeStringArray(doc.appearsInEvents);
  if (appearsIn.length > 0) lore.appearsInEvents = appearsIn;

  return lore;
}

function buildPlay(
  doc: LegacyCharacterDoc,
): { play: PlayPayload; warnings: string[] } {
  const sheet = (doc.sheet ?? {}) as Record<string, unknown>;

  const weaponTraining = normalizeTrainingField(sheet.weaponTraining);
  const skillTraining = normalizeTrainingField(sheet.skillTraining);

  const equipmentRaw = Array.isArray(sheet.equipment)
    ? (sheet.equipment as LegacyEquipment[])
    : [];

  const { abilities, warnings } = normalizeAbilities(
    sheet.abilities,
    doc.codename,
  );

  const play: PlayPayload = {
    className: asStringOrFallback(sheet.className),
    hp: asNumberOrZero(sheet.hp),
    hpDelta: 0,
    san: asNumberOrZero(sheet.san),
    sanDelta: 0,
    def: asNumberOrZero(sheet.def),
    defDelta: 0,
    atk: asNumberOrZero(sheet.atk),
    atkDelta: 0,
    weaponTraining,
    skillTraining,
    credit: asStringOrFallback(sheet.credit, "0"),
    equipment: equipmentRaw,
    abilities,
  };

  if (typeof sheet.abilityType === "string" && sheet.abilityType !== "") {
    play.abilityType = sheet.abilityType;
  }

  return { play, warnings };
}

/* ── 도큐먼트 단위 plan 빌드 ── */

export function planForDoc(doc: LegacyCharacterDoc): MigrationPlan {
  const hasSheet =
    doc.sheet !== undefined && doc.sheet !== null && typeof doc.sheet === "object";
  const hasLore =
    doc.lore !== undefined && doc.lore !== null && typeof doc.lore === "object";

  // 1) 이미 마이그레이션됨 (lore 있고 sheet 없음) → skip 또는 root 메타/필수 필드 보강
  if (hasLore && !hasSheet) {
    const unsetKeys: string[] = [];
    for (const key of ROOT_TO_LORE_META_KEYS) {
      if (doc[key] !== undefined) unsetKeys.push(key);
    }

    const setPayload = buildExistingLoreRepairPatch(doc);
    const hasRepairs = Object.keys(setPayload).length > 0;
    if (unsetKeys.length === 0 && !hasRepairs) {
      return {
        codename: doc.codename,
        type: doc.type,
        action: DRY_RUN ? "예상 skip" : "skip",
        reason: "이미 마이그레이션됨 (lore 보유, sheet 부재)",
      };
    }

    return {
      codename: doc.codename,
      type: doc.type,
      action: DRY_RUN ? "예상 cleanup-sheet" : "cleanup-sheet",
      reason: "lore 보유 + root 메타/필수 lore 필드 보강",
      setPayload: hasRepairs ? setPayload : undefined,
      unsetKeys,
    };
  }

  // 2) 부분 마이그레이션 상태 (lore 있고 sheet 도 있음) → sheet 만 정리
  if (hasLore && hasSheet) {
    const unsetKeys = ["sheet"];
    // root 메타가 lore 안으로 이미 옮겨져 있는지 확인하고, root 에 잔재가 있으면 함께 제거
    for (const key of ROOT_TO_LORE_META_KEYS) {
      if (doc[key] !== undefined) unsetKeys.push(key);
    }
    const setPayload = buildExistingLoreRepairPatch(doc);
    return {
      codename: doc.codename,
      type: doc.type,
      action: DRY_RUN ? "예상 cleanup-sheet" : "cleanup-sheet",
      reason: "lore 보유 + sheet 잔존 — sheet 정리 및 lore 보강",
      setPayload:
        Object.keys(setPayload).length > 0 ? setPayload : undefined,
      unsetKeys,
    };
  }

  // 3) 정식 변환 (sheet → lore + play)
  const lore = buildLore(doc);
  const setPayload: Record<string, unknown> = { lore };
  const warnings: string[] = [];

  if (doc.type === "AGENT") {
    const { play, warnings: playWarnings } = buildPlay(doc);
    setPayload.play = play;
    warnings.push(...playWarnings);
  }

  const unsetKeys: string[] = ["sheet"];
  for (const key of ROOT_TO_LORE_META_KEYS) {
    if (doc[key] !== undefined) unsetKeys.push(key);
  }

  const loreCount = Object.keys(lore).length;
  const playCount =
    doc.type === "AGENT"
      ? Object.keys(setPayload.play as PlayPayload).length
      : 0;
  const summary =
    doc.type === "AGENT"
      ? `sheet→lore(${loreCount}keys) + play(${playCount}keys, abilities slot 자동)`
      : `sheet→lore(${loreCount}keys) + 메타 root→lore`;

  return {
    codename: doc.codename,
    type: doc.type,
    action: DRY_RUN ? "예상 update" : "update",
    reason: summary,
    setPayload,
    unsetKeys,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/* ── 출력 ── */

function printPlanRow(plan: MigrationPlan): void {
  const marker = plan.action.startsWith("예상") ? "[plan]" : "[done]";
  console.log(
    `  ${marker} ${plan.codename.padEnd(20)} (${plan.type.padEnd(5)}) | ${plan.reason} | ${plan.action}`,
  );
  if (plan.warnings && plan.warnings.length > 0) {
    for (const w of plan.warnings) {
      console.warn(`    [warn] ${w}`);
    }
  }
  if (VERBOSE && plan.setPayload) {
    console.log(`     $set: ${JSON.stringify(plan.setPayload, null, 2)}`);
  }
  if (VERBOSE && plan.unsetKeys && plan.unsetKeys.length > 0) {
    console.log(`     $unset: ${JSON.stringify(plan.unsetKeys)}`);
  }
}

/* ── invariant 검증 ── */

interface InvariantViolation {
  codename: string;
  reasons: string[];
}

export function validateDoc(doc: LegacyCharacterDoc): InvariantViolation | null {
  const reasons: string[] = [];

  if (doc.sheet !== undefined) {
    reasons.push("sheet 필드가 잔존");
  }

  const lore = doc.lore as Record<string, unknown> | undefined;
  if (!lore || typeof lore !== "object") {
    reasons.push("lore 필드 부재");
  } else {
    if (typeof lore.weight !== "string") {
      reasons.push(`lore.weight 가 string 이 아님 (typeof=${typeof lore.weight})`);
    }
  }

  if (doc.type === "AGENT") {
    const play = doc.play as Record<string, unknown> | undefined;
    if (!play || typeof play !== "object") {
      reasons.push("AGENT 인데 play 필드 부재");
    } else {
      if (!Array.isArray(play.weaponTraining)) {
        reasons.push("play.weaponTraining 이 배열이 아님");
      }
      if (!Array.isArray(play.skillTraining)) {
        reasons.push("play.skillTraining 이 배열이 아님");
      }
      if (Array.isArray(play.abilities)) {
        const abilities = play.abilities as LegacyAbility[];
        for (let i = 0; i < abilities.length; i += 1) {
          const a = abilities[i];
          if (!a || typeof a.slot !== "string" || a.slot === "") {
            reasons.push(`play.abilities[${i}].slot 미정의`);
          }
        }
      } else {
        reasons.push("play.abilities 가 배열이 아님");
      }
    }
  } else if (doc.type === "NPC") {
    if (doc.play !== undefined) {
      reasons.push("NPC 인데 play 필드 존재");
    }
  }

  return reasons.length > 0
    ? { codename: doc.codename, reasons }
    : null;
}

/* ── 메인 ── */

async function main(): Promise<void> {
  if (!MONGODB_URI) {
    console.error(
      "[migrate-character-sheet] MONGODB_URI 환경변수가 설정되지 않았습니다.",
    );
    process.exit(1);
  }

  initServerless({ uri: MONGODB_URI, dbName: DB_NAME });

  const client = await getClient();
  const col = client.db(DB_NAME).collection<LegacyCharacterDoc>("characters");

  // unknown 도큐먼트 형태로 raw 조회 (스키마 검증 없이 모든 필드 보존)
  const allDocs = await col.find({}).toArray();
  const total = allDocs.length;

  console.log(
    `[migrate-character-sheet] ${DRY_RUN ? "DRY-RUN" : "WRITE"} 모드 | total=${total}`,
  );

  const plans = allDocs.map((d) => planForDoc(d));

  let plannedUpdates = 0;
  let plannedCleanups = 0;
  let plannedSkips = 0;
  let updated = 0;
  let cleanedUp = 0;
  let skipped = 0;

  // 사전 출력 (dry-run plan / verbose 시 모두 출력)
  for (const plan of plans) {
    if (DRY_RUN || VERBOSE) printPlanRow(plan);

    if (plan.action.includes("update")) plannedUpdates += 1;
    else if (plan.action.includes("cleanup")) plannedCleanups += 1;
    else if (plan.action.includes("skip")) plannedSkips += 1;
  }

  if (DRY_RUN) {
    console.log(
      `\n[migrate-character-sheet] DRY-RUN 완료: planned_updates=${plannedUpdates} planned_cleanups=${plannedCleanups} skipped=${plannedSkips} total=${total}`,
    );
    await closeServerless().catch(() => {});
    return;
  }

  // WRITE 모드 — 실제 적용
  try {
    for (let i = 0; i < plans.length; i += 1) {
      const plan = plans[i]!;
      const doc = allDocs[i]!;

      if (plan.action === "skip") {
        if (!VERBOSE) printPlanRow(plan);
        skipped += 1;
        continue;
      }

      const updateOp: { $set?: Record<string, unknown>; $unset?: Record<string, ""> } = {};
      if (plan.setPayload) {
        updateOp.$set = { ...plan.setPayload, updatedAt: new Date() };
      } else {
        // cleanup 만 하는 경우에도 updatedAt 갱신
        updateOp.$set = { updatedAt: new Date() };
      }
      if (plan.unsetKeys && plan.unsetKeys.length > 0) {
        updateOp.$unset = Object.fromEntries(
          plan.unsetKeys.map((k) => [k, ""] as const),
        );
      }

      await col.updateOne({ _id: doc._id as never }, updateOp);

      if (!VERBOSE) printPlanRow(plan);

      if (plan.action === "update") updated += 1;
      else if (plan.action === "cleanup-sheet") cleanedUp += 1;
    }
  } catch (err) {
    console.error("[migrate-character-sheet] 처리 중 에러:", err);
    console.log(
      `[migrate-character-sheet] 중단 시점까지 처리: updated=${updated} cleanup=${cleanedUp} skipped=${skipped}`,
    );
    await closeServerless().catch(() => {});
    process.exit(1);
  }

  console.log(
    `\n[migrate-character-sheet] 완료: updated=${updated} cleanup=${cleanedUp} skipped=${skipped} total=${total}`,
  );

  // ── invariant 검증 ──
  console.log("[migrate-character-sheet] invariant 검증 중...");
  const postDocs = await col.find({}).toArray();
  const violations: InvariantViolation[] = [];
  for (const doc of postDocs) {
    const v = validateDoc(doc);
    if (v) violations.push(v);
  }

  if (violations.length > 0) {
    console.error(
      `[migrate-character-sheet] invariant 위반 ${violations.length}건:`,
    );
    for (const v of violations) {
      console.error(`  - ${v.codename}: ${v.reasons.join("; ")}`);
    }
    await closeServerless().catch(() => {});
    process.exit(1);
  }

  console.log("[migrate-character-sheet] invariant 검증 통과");
  await closeServerless().catch(() => {});
}

/**
 * shared-db 의 close()는 long-running 모드만 처리한다.
 * 서버리스 모드에서 cli 프로세스를 종료하려면 globalThis 캐시에 있는 client 를
 * 직접 close 해야 프로세스가 끝난다. (seed-factions.ts 와 동일 패턴)
 */
async function closeServerless(): Promise<void> {
  try {
    const client = await getClient();
    await client.close();
  } catch {
    // init 실패 등으로 client 가 없으면 무시
  }
}

/**
 * 진입점 가드 — `import` 시 실행되지 않도록.
 * Node 22 의 `--experimental-strip-types` 는 process.argv[1] 에 .ts 경로를 그대로 둔다.
 * 테스트 파일에서 dynamic import 시 main() 자동 실행을 막는다.
 */
const isMainEntry = (() => {
  const entry = process.argv[1] ?? "";
  return entry.endsWith("migrate-character-sheet-to-lore-play.ts");
})();

if (isMainEntry) {
  main().catch((err) => {
    console.error("[migrate-character-sheet] fatal:", err);
    process.exit(1);
  });
}
