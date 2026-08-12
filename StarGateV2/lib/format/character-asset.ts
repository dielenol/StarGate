/**
 * 호환 진입점. 신규 자산 코드는 `lib/assets/characters.ts`를 SSOT로 사용한다.
 */
export {
  getCharacterAssetPath,
  getPixelCharacterPath,
  getPixelProfilePath,
  KNOWN_CHARACTER_ASSET_SLUGS,
  resolveCharacterAssetSlug,
  type CharacterAssetSlug,
} from "../assets/characters.ts";
