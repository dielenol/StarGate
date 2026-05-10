/**
 * 캐릭터 codename → 디스크 슬러그/asset 경로 매핑.
 *
 * 정책:
 *   - 디스크 자산은 `peoples/<Slug>-{main-image,pixel-profile,pixel-character,poster}.{png|webp}`
 *   - codename(DB) ≠ Slug(파일) 인 경우가 많아 명시 매핑 + 정규화 매칭 폴백.
 *
 * 매칭 우선순위:
 *   1. EXPLICIT_CODENAME_TO_SLUG — 정규화로 안 잡히는 케이스 (TIME → Cronus 등)
 *   2. 정규화 (소문자 + 공백/하이픈 제거) 매칭 — KNOWN_SLUGS 와 비교
 *
 * 신규 캐릭터 등록 시 KNOWN_SLUGS / EXPLICIT 둘 중 하나에 추가 필요.
 * 향후 lore.pixelCharacter 필드 도입 시 본 헬퍼 deprecated 가능.
 */

const ASSET_BASE = "/assets/peoples";

/** codename(DB) → 디스크 슬러그 명시 매핑. 정규화로 안 맞는 케이스만 등재. */
const EXPLICIT_CODENAME_TO_SLUG: Record<string, string> = {
  TIME: "Cronus",
  PIPETTE: "Pinch",
  TIGER298: "Siyu",
  "WD-(𝓃)": "WD",
  UNYEON: "운연",
  YUHOE: "유회",
  네베드: "NeBeD",
};

/** 디스크에 존재하는 슬러그 화이트리스트. 정규화 매칭의 후보. */
const KNOWN_SLUGS = [
  "BigBoy",
  "Clown",
  "Cronus",
  "InDexer",
  "Kimlee",
  "Leedongsik",
  "Margaret",
  "Maria",
  "NeBeD",
  "Otilia",
  "Pinch",
  "Siyu",
  "WD",
  "운연",
  "유회",
] as const;

function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s\-_]+/g, "");
}

/**
 * codename → 디스크 슬러그. 매핑 없으면 null.
 *
 * @example
 *   resolveCharacterAssetSlug("BIG BOY")  → "BigBoy"
 *   resolveCharacterAssetSlug("TIME")     → "Cronus"
 *   resolveCharacterAssetSlug("UNKNOWN")  → null
 */
export function resolveCharacterAssetSlug(codename: string): string | null {
  if (!codename) return null;
  const explicit = EXPLICIT_CODENAME_TO_SLUG[codename];
  if (explicit) return explicit;
  const norm = normalize(codename);
  for (const slug of KNOWN_SLUGS) {
    if (normalize(slug) === norm) return slug;
  }
  return null;
}

/**
 * pixel-character (도트 캐릭터 풀샷) 경로. 자산이 없을 가능성도 있어
 * 호출처에서 폴백 chain (pixel-profile → Seal) 적용 권장.
 */
export function getPixelCharacterPath(codename: string): string | null {
  const slug = resolveCharacterAssetSlug(codename);
  return slug ? `${ASSET_BASE}/${slug}-pixel-character.png` : null;
}
