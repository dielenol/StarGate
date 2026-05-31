import {
  catalogItemDocSchema,
  catalogItemFrontmatterSchema,
  type CatalogItemDoc,
} from "./catalog.schema.js";
import {
  consumableDocSchema,
  consumableFrontmatterSchema,
  type ConsumableDoc,
} from "./consumable.schema.js";
import {
  equipmentDocSchema,
  equipmentFrontmatterSchema,
  type EquipmentDoc,
} from "./equipment.schema.js";
import {
  factionDocSchema,
  factionFrontmatterSchema,
  type FactionDoc,
} from "./faction.schema.js";
import {
  institutionDocSchema,
  institutionFrontmatterSchema,
  type InstitutionDoc,
} from "./institution.schema.js";
import {
  npcDocSchema,
  npcFrontmatterSchema,
  type NpcDoc,
} from "./npc.schema.js";

/* ── body 섹션 키 규약 ──
   한국어/영어 별칭 허용, 대소문자·공백 무시. */

const BODY_SECTION_ALIASES: Record<string, string> = {
  "대사": "quote",
  "quote": "quote",
  "외형": "appearance",
  "appearance": "appearance",
  "성격": "personality",
  "personality": "personality",
  "배경": "background",
  "background": "background",
  "역할 상세": "roleDetail",
  "역할상세": "roleDetail",
  "roledetail": "roleDetail",
  "이름 설명": "notes",
  "이름/코드네임 설명": "notes",
  "notes": "notes",
  "비고": "notes",
  "이념/가치관": "ideology",
  "ideology": "ideology",
  "임무": "mission",
  "mission": "mission",
  "설명": "description",
  "description": "description",
  "획득": "acquisition",
  "획득 경로": "acquisition",
  "획득경로": "acquisition",
  "acquisition": "acquisition",
};

function canonicalSectionId(raw: string): string | null {
  const key = raw.trim().toLowerCase();
  return BODY_SECTION_ALIASES[key] ?? null;
}

/* ── frontmatter YAML 최소 파서 ──
   MVP 파싱 제약: 평탄 키-값, 인라인 배열 [a, b], 블록 배열 "- 항목",
   boolean, 문자열. 중첩 객체/복잡 YAML은 throw.
   js-yaml 도입 금지(요청사항). */

export interface ParsedFrontmatter {
  data: Record<string, unknown>;
  body: string;
}

export interface ParseFrontmatterOptions {
  /**
   * frontmatter 구분자 부재 시 throw 대신 `{data: {}, body: raw}` 반환.
   *
   * 기본 `true` — backward compatibility. 구 호출부가 silent fallback을 기대하기 때문.
   * 신규 호출부(예: `/create-lore` skill)는 `false`로 명시해 원인 조기 노출을 권장한다.
   */
  allowMissing?: boolean;
  /** 에러 메시지에 포함할 파일명 힌트 (디버깅). */
  fileName?: string;
}

const FRONTMATTER_RE = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/;
const LEADING_COMMENT_RE = /^(?:\s*<!--[\s\S]*?-->\s*\r?\n?)+/;

/**
 * 인라인 배열 문자열을 따옴표를 인지한 상태로 토큰화한다.
 * 예: `alpha, "beta, gamma", delta` → ["alpha", "beta, gamma", "delta"]
 */
function tokenizeInlineArray(inner: string): string[] {
  const tokens: string[] = [];
  let buf = "";
  let quote: string | null = null;
  for (const ch of inner) {
    if (quote) {
      buf += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      buf += ch;
      continue;
    }
    if (ch === ",") {
      const t = buf.trim();
      if (t !== "") tokens.push(t);
      buf = "";
      continue;
    }
    buf += ch;
  }
  const last = buf.trim();
  if (last !== "") tokens.push(last);
  return tokens;
}

function parseScalar(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === "") return "";
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null" || trimmed === "~") return null;

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const inner = trimmed.slice(1, -1).trim();
    if (inner === "") return [];
    return tokenizeInlineArray(inner).map((part) => parseScalar(part));
  }

  // 숫자 자동 coercion은 제거 — 모든 스칼라는 문자열로 유지 (boolean/null만 특별 처리).
  // 숫자가 필요한 스키마는 z.coerce.number() 등 각자 처리한다.
  return trimmed;
}

export function parseFrontmatter(
  raw: string,
  options: ParseFrontmatterOptions = {}
): ParsedFrontmatter {
  const { allowMissing = true, fileName } = options;

  // Leading HTML 주석 블록을 제거한 뒤 frontmatter 매칭 시도.
  // 템플릿 4종 전부 `<!-- ... -->` 주석으로 시작하므로 이 전처리 없이는 매칭 실패.
  const stripped = raw.replace(LEADING_COMMENT_RE, "");
  const match = FRONTMATTER_RE.exec(stripped);
  if (!match) {
    if (allowMissing) {
      return { data: {}, body: raw };
    }
    const where = fileName ? ` (${fileName})` : "";
    throw new Error(
      `frontmatter 구분자('---')를 찾지 못했습니다${where}. YAML frontmatter 블록이 필요합니다.`
    );
  }

  const yamlBlock = match[1];
  const body = match[2] ?? "";
  const lines = yamlBlock.split(/\r?\n/);

  const data: Record<string, unknown> = {};
  // 이전 라인이 bare key(`key:`)인 경우 — 다음 라인이 `- item`이면 블록 배열로 승격,
  // 아니면 빈 문자열로 확정. lookahead 방식.
  let pendingKey: string | null = null;
  let currentListKey: string | null = null;
  let blockList: unknown[] | null = null;

  const flushPendingAsEmptyString = () => {
    if (pendingKey !== null) {
      data[pendingKey] = "";
      pendingKey = null;
    }
  };
  const flushBlockList = () => {
    if (currentListKey !== null && blockList !== null) {
      data[currentListKey] = blockList;
      currentListKey = null;
      blockList = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "" || line.trim().startsWith("#")) continue;

    const blockItemMatch = /^(\s*)-\s+(.*)$/.exec(line);
    if (blockItemMatch) {
      // 블록 배열 항목: 바로 직전 bare key(pendingKey)가 있으면 그 key를 배열로 승격.
      if (pendingKey !== null) {
        currentListKey = pendingKey;
        blockList = [];
        pendingKey = null;
      }
      if (currentListKey === null || blockList === null) {
        throw new Error(
          `frontmatter 파싱 실패: 블록 배열 '-' 항목이 key 없이 나타남 (line ${i + 1})${fileName ? ` [${fileName}]` : ""}`
        );
      }
      const indent = blockItemMatch[1].length;
      if (indent < 2) {
        throw new Error(
          `frontmatter 파싱 실패: 블록 배열 항목 indent가 2 미만 (line ${i + 1})${fileName ? ` [${fileName}]` : ""}`
        );
      }
      blockList.push(parseScalar(blockItemMatch[2]));
      continue;
    }

    // 비-리스트 라인 — 직전 pending/blockList 정리
    flushBlockList();
    flushPendingAsEmptyString();

    if (/^\s/.test(line)) {
      throw new Error(
        `frontmatter 파싱 실패: 중첩 객체/복잡 YAML은 지원 안 함 (line ${i + 1})${fileName ? ` [${fileName}]` : ""}`
      );
    }

    const kvMatch = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/.exec(line);
    if (!kvMatch) {
      throw new Error(
        `frontmatter 파싱 실패: 키:값 형식 아님 (line ${i + 1}): "${line}"${fileName ? ` [${fileName}]` : ""}`
      );
    }

    const key = kvMatch[1];
    const value = kvMatch[2];

    if (value.trim() === "") {
      // 빈 값은 확정하지 않고 pending 상태로 유지. 다음 라인이 `- item`이면 배열로 승격.
      pendingKey = key;
      continue;
    }

    data[key] = parseScalar(value);
  }

  // 마지막 라인 정리
  flushBlockList();
  flushPendingAsEmptyString();

  return { data, body };
}

export function parseMdBody(body: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = body.split(/\r?\n/);

  let currentId: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (currentId !== null) {
      const content = buffer.join("\n").trim();
      if (content !== "") result[currentId] = content;
    }
  };

  const headingRe = /^##\s+(.+?)\s*$/;

  for (const line of lines) {
    const h = headingRe.exec(line);
    if (h) {
      flush();
      currentId = canonicalSectionId(h[1]);
      buffer = [];
      continue;
    }
    if (currentId !== null) {
      buffer.push(line);
    }
  }

  flush();
  return result;
}

/* ── DB 문서 변환 ── */

function now(): Date {
  return new Date();
}

function coerceDate(value: unknown, fallback: Date): Date {
  if (typeof value === "string" && value !== "") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return fallback;
}

/** 빈 문자열을 undefined로 정규화 (frontmatter 템플릿의 빈 라인 수용 후 DB 적재용). */
function emptyToUndefined<T>(value: T | "" | undefined): T | undefined {
  return value === "" ? undefined : (value as T | undefined);
}

export function toDbFaction(frontmatter: unknown, body: string): FactionDoc {
  const parsed = factionFrontmatterSchema.parse(frontmatter);
  const sections = parseMdBody(body);

  const n = now();
  const candidate: FactionDoc = {
    ...parsed,
    ideology: parsed.ideology ?? sections.ideology,
    loreMd: parsed.loreMd ?? (body.trim() !== "" ? body : undefined),
    createdAt: coerceDate(parsed.createdAt, n),
    updatedAt: coerceDate(parsed.updatedAt, n),
  };

  return factionDocSchema.parse(candidate);
}

export function toDbInstitution(
  frontmatter: unknown,
  body: string
): InstitutionDoc {
  const parsed = institutionFrontmatterSchema.parse(frontmatter);
  const sections = parseMdBody(body);

  const n = now();
  const candidate: InstitutionDoc = {
    ...parsed,
    parentFactionCode: emptyToUndefined(parsed.parentFactionCode),
    leaderCodename: emptyToUndefined(parsed.leaderCodename),
    mission: parsed.mission ?? sections.mission,
    loreMd: parsed.loreMd ?? (body.trim() !== "" ? body : undefined),
    createdAt: coerceDate(parsed.createdAt, n),
    updatedAt: coerceDate(parsed.updatedAt, n),
  };

  return institutionDocSchema.parse(candidate);
}

export interface NpcBodySections {
  appearance?: string;
  personality?: string;
  background?: string;
  roleDetail?: string;
  notes?: string;
  quote?: string;
}

/**
 * MD NPC frontmatter + 본문을 NpcDoc으로 변환한다.
 *
 * @param frontmatter  parseFrontmatter로 파싱한 data 객체
 * @param bodySectionsOrBody  parseMdBody 결과(섹션 맵). backward-compat: string도 받음.
 * @param body                선택. `bodySectionsOrBody`가 섹션 맵일 때만 의미 있음.
 *                            원본 MD body 전체를 `loreMd`에 보존.
 *                            "## 관계 (참고)" "## 데이터 연동" 등 canonical 섹션으로
 *                            분해되지 않는 자료는 본문 원문에서만 복원할 수 있다.
 */
export function toDbNpc(
  frontmatter: unknown,
  bodySectionsOrBody: NpcBodySections | string,
  body?: string
): NpcDoc {
  const parsed = npcFrontmatterSchema.parse(frontmatter);
  const n = now();

  // backward-compat: 두 번째 인자가 string이면 body로 간주 (예전 호출부 보호)
  let sections: NpcBodySections;
  let resolvedBody: string | undefined;
  if (typeof bodySectionsOrBody === "string") {
    sections = parseMdBody(bodySectionsOrBody);
    resolvedBody = bodySectionsOrBody;
  } else {
    sections = bodySectionsOrBody;
    resolvedBody = body;
  }

  const candidate: NpcDoc = {
    codename: parsed.codename,
    type: "NPC",
    role: parsed.role,
    department: emptyToUndefined(parsed.department),
    factionCode: emptyToUndefined(parsed.factionCode),
    institutionCode: emptyToUndefined(parsed.institutionCode),
    previewImage: parsed.previewImage ?? "",
    pixelCharacterImage: emptyToUndefined(parsed.pixelCharacterImage),
    warningVideo: emptyToUndefined(parsed.warningVideo),
    agentLevel: parsed.agentLevel,
    isPublic: parsed.isPublic,
    lore: {
      // 이름 — nameKo 가 주 표기(한국어), nameEn/nameNative/nickname 은 옵션
      name: parsed.nameKo,
      nameNative: emptyToUndefined(parsed.nameNative),
      nickname: emptyToUndefined(parsed.nickname),
      nameEn: parsed.nameEn,

      // 인물 신상 — 빈 문자열은 그대로 유지(스키마가 z.string() 필수라서 ""로 보존)
      gender: parsed.gender ?? "",
      age: parsed.age ?? "",
      height: parsed.height ?? "",
      weight: parsed.weight ?? "",

      // 서사 — body 섹션 매핑
      appearance: sections.appearance ?? "",
      personality: sections.personality ?? "",
      background: sections.background ?? "",
      quote: sections.quote ?? "",

      // 이미지 — NPC frontmatter 에 mainImage 가 없으므로 ""로 초기화
      mainImage: "",
      posterImage: emptyToUndefined(parsed.posterImage),

      // 메타 — frontmatter 에서 lore 영역으로 이동된 필드들
      loreTags: parsed.loreTags,
      appearsInEvents: parsed.appearsInEvents,

      // NPC 호환 필드 — body 섹션 매핑
      roleDetail: sections.roleDetail,
      notes: sections.notes,
    },
    loreMd:
      resolvedBody !== undefined && resolvedBody.trim() !== ""
        ? resolvedBody
        : undefined,
    source: parsed.source,
    ownerId: null,
    createdAt: coerceDate(parsed.createdAt, n),
    updatedAt: coerceDate(parsed.updatedAt, n),
    authorId: parsed.authorId,
    authorName: parsed.authorName,
  };

  return npcDocSchema.parse(candidate);
}

/* ── Equipment / Consumable 어댑터 ──
   spec MD frontmatter + body 섹션 → master_items 미러 문서.
   body 섹션은 "## 설명 / 배경 / 획득 경로 / 비고" 4종을 추출하고
   description 은 frontmatter 가 비어 있을 경우 body "## 설명" 으로 폴백한다.
   배경/획득/비고는 lore.* sub-document 에 적재. */

interface CatalogBodySections {
  description?: string;
  background?: string;
  acquisition?: string;
  notes?: string;
}

/**
 * parseMdBody 결과(`Record<string, string>`) 에서 카탈로그 어댑터가 사용하는
 * 4개 섹션만 명시적으로 골라낸다. 캐스팅으로 좁히면 record 의 임의 키가
 * sections 에 슬쩍 흘러들 수 있어 타입 안전성 저하 → 명시 picker 로 차단.
 */
function pickCatalogBodySections(
  sections: Record<string, string>,
): CatalogBodySections {
  return {
    description: sections.description,
    background: sections.background,
    acquisition: sections.acquisition,
    notes: sections.notes,
  };
}

function pickCatalogLore(
  sections: CatalogBodySections
): { background?: string; acquisition?: string; notes?: string } | undefined {
  if (!sections.background && !sections.acquisition && !sections.notes) {
    return undefined;
  }
  return {
    background: sections.background,
    acquisition: sections.acquisition,
    notes: sections.notes,
  };
}

/**
 * Equipment frontmatter + body 를 EquipmentDoc 으로 변환.
 *
 * 정책 차이 vs NPC/Faction/Institution: 카탈로그는 `previewImage` 미지정 시
 * `undefined` 보존 (NPC 는 `""` 빈 문자열로 정규화). `loreMd` 도 frontmatter 가 아닌
 * body 원문 그대로 보존 — body 가 단일 진실원.
 */
export function toDbEquipment(
  frontmatter: unknown,
  body: string
): EquipmentDoc {
  const parsed = equipmentFrontmatterSchema.parse(frontmatter);
  const sections = pickCatalogBodySections(parseMdBody(body));
  const n = now();

  // frontmatter.description 이 있으면 우선 사용, 비어 있으면 body "## 설명" 으로 폴백.
  // 둘 다 비어 있으면 명시적 에러 — frontmatter 의 description 은 optional 이지만,
  // 최종 EquipmentDoc.description 은 min(1) 이므로 어댑터 단계에서 조기 거절한다.
  const description = parsed.description ?? sections.description ?? "";
  if (description.length === 0) {
    throw new Error(
      "equipment 어댑터: description 이 frontmatter 또는 body '## 설명' 에 반드시 있어야 합니다",
    );
  }

  const candidate: EquipmentDoc = {
    code: parsed.code,
    slug: parsed.slug,
    name: parsed.name,
    nameEn: parsed.nameEn,
    category: parsed.category,
    price: parsed.price,
    damage: parsed.damage,
    description,
    // previewImage 는 카탈로그 미지정 케이스 undefined 보존 (NPC 와 다른 정책).
    previewImage: parsed.previewImage,
    isAvailable: parsed.isAvailable,
    isPublic: parsed.isPublic,
    tags: parsed.tags,
    loreMd: body.trim() !== "" ? body : undefined,
    lore: pickCatalogLore(sections),
    source: parsed.source,
    createdAt: coerceDate(parsed.createdAt, n),
    updatedAt: coerceDate(parsed.updatedAt, n),
    authorId: parsed.authorId,
    authorName: parsed.authorName,
  };

  return equipmentDocSchema.parse(candidate);
}

/**
 * Consumable frontmatter + body 를 ConsumableDoc 으로 변환.
 *
 * 정책 차이 vs NPC/Faction/Institution: 카탈로그는 `previewImage` 미지정 시
 * `undefined` 보존 (NPC 는 `""` 빈 문자열로 정규화). `loreMd` 도 frontmatter 가 아닌
 * body 원문 그대로 보존 — body 가 단일 진실원.
 */
export function toDbConsumable(
  frontmatter: unknown,
  body: string
): ConsumableDoc {
  const parsed = consumableFrontmatterSchema.parse(frontmatter);
  const sections = pickCatalogBodySections(parseMdBody(body));
  const n = now();

  // description 폴백 — equipment 와 동일 정책.
  const description = parsed.description ?? sections.description ?? "";
  if (description.length === 0) {
    throw new Error(
      "consumable 어댑터: description 이 frontmatter 또는 body '## 설명' 에 반드시 있어야 합니다",
    );
  }

  const candidate: ConsumableDoc = {
    code: parsed.code,
    slug: parsed.slug,
    name: parsed.name,
    nameEn: parsed.nameEn,
    category: parsed.category,
    price: parsed.price,
    effect: parsed.effect,
    description,
    // previewImage 는 카탈로그 미지정 케이스 undefined 보존 (NPC 와 다른 정책).
    previewImage: parsed.previewImage,
    isAvailable: parsed.isAvailable,
    isPublic: parsed.isPublic,
    tags: parsed.tags,
    loreMd: body.trim() !== "" ? body : undefined,
    lore: pickCatalogLore(sections),
    source: parsed.source,
    createdAt: coerceDate(parsed.createdAt, n),
    updatedAt: coerceDate(parsed.updatedAt, n),
    authorId: parsed.authorId,
    authorName: parsed.authorName,
  };

  return consumableDocSchema.parse(candidate);
}

/**
 * Generic catalog frontmatter + body 를 CatalogItemDoc 으로 변환.
 *
 * MATERIAL/SPECIAL 처럼 equipment/consumable 하위 타입으로 좁히면 의미가
 * 흐려지는 항목을 위한 master_items mirror 경로다.
 */
export function toDbCatalogItem(
  frontmatter: unknown,
  body: string
): CatalogItemDoc {
  const parsed = catalogItemFrontmatterSchema.parse(frontmatter);
  const sections = pickCatalogBodySections(parseMdBody(body));
  const n = now();

  const description = parsed.description ?? sections.description ?? "";
  if (description.length === 0) {
    throw new Error(
      "catalog item 어댑터: description 이 frontmatter 또는 body '## 설명' 에 반드시 있어야 합니다",
    );
  }

  const candidate: CatalogItemDoc = {
    code: parsed.code,
    slug: parsed.slug,
    name: parsed.name,
    nameEn: parsed.nameEn,
    category: parsed.category,
    price: parsed.price,
    damage: parsed.damage,
    effect: parsed.effect,
    description,
    previewImage: parsed.previewImage,
    isAvailable: parsed.isAvailable,
    isPublic: parsed.isPublic,
    tags: parsed.tags,
    loreMd: body.trim() !== "" ? body : undefined,
    lore: pickCatalogLore(sections),
    source: parsed.source,
    createdAt: coerceDate(parsed.createdAt, n),
    updatedAt: coerceDate(parsed.updatedAt, n),
    authorId: parsed.authorId,
    authorName: parsed.authorName,
  };

  return catalogItemDocSchema.parse(candidate);
}
