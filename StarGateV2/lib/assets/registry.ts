import * as catalogAssets from "./catalog.ts";
import {
  getCharacterAssetPath,
  KNOWN_CHARACTER_ASSET_SLUGS,
} from "./characters.ts";
import * as npcAssets from "./npcs.ts";
import * as shopAssets from "./shop.ts";

const PUBLIC_IMAGE_PATH =
  /^\/assets\/.+\.(?:avif|gif|jpe?g|png|svg|webp)(?:\?.*)?$/i;

function collectPublicAssetPaths(
  value: unknown,
  paths: Set<string>,
  visited: Set<object>,
): void {
  if (typeof value === "string") {
    if (PUBLIC_IMAGE_PATH.test(value)) paths.add(value);
    return;
  }
  if (!value || typeof value !== "object" || visited.has(value)) return;

  visited.add(value);
  for (const child of Object.values(value)) {
    collectPublicAssetPaths(child, paths, visited);
  }
}

/**
 * 중앙 자산 모듈이 공개하는 모든 실제 이미지 경로.
 * audit와 계약 테스트가 동적 AssetSpec 결과까지 파일시스템과 대조할 때 사용한다.
 */
export const PUBLIC_ASSET_REGISTRY_PATHS = (() => {
  const paths = new Set<string>();
  const visited = new Set<object>();

  for (const assetModule of [catalogAssets, npcAssets, shopAssets]) {
    collectPublicAssetPaths(assetModule, paths, visited);
  }
  for (const slug of KNOWN_CHARACTER_ASSET_SLUGS) {
    for (const role of [
      "main-image",
      "pixel-character",
      "pixel-profile",
    ] as const) {
      const assetPath = getCharacterAssetPath(slug, role);
      if (assetPath) paths.add(assetPath);
    }
  }

  return [...paths].sort();
})();
