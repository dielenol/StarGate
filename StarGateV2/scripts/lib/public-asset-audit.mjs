import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { KNOWN_CHARACTER_ASSET_SLUGS } from "../../lib/assets/characters.ts";
import { PUBLIC_ASSET_REGISTRY_PATHS } from "../../lib/assets/registry.ts";

const IMAGE_EXTENSION = /\.(?:avif|gif|jpe?g|png|svg|webp)$/i;
const SOURCE_EXTENSION = /\.(?:cjs|css|js|json|jsx|md|mjs|ts|tsx)$/i;
const ASSET_REFERENCE =
  /\/assets\/[A-Za-z0-9_./-]+\.(?:avif|gif|jpe?g|png|svg|webp)(?:\?[A-Za-z0-9_.=&-]+)?/gi;
const LOWER_KEBAB_FILE = /^[a-z0-9]+(?:-[a-z0-9]+)*\.(?:avif|gif|jpe?g|png|svg|webp)$/;
const RASTER_LOWER_KEBAB_FILE =
  /^[a-z0-9]+(?:-[a-z0-9]+)*\.(?:avif|gif|jpe?g|png|webp)$/;
const SHOP_ITEM_FILE =
  /^[a-z0-9]+(?:(?:-|_)[a-z0-9]+)*\.(?:avif|gif|jpe?g|png|webp)$/;
const NPC_ENTITY = "[A-Z0-9][A-Za-z0-9]*(?:-[A-Z0-9][A-Za-z0-9]*)*";
const NPC_ROLE =
  "(?:main-image|pixel-character|pixel-profile|profile|[a-z0-9]+(?:-[a-z0-9]+)*)";
const NPC_TOP_LEVEL_FILE = new RegExp(
  `^${NPC_ENTITY}-${NPC_ROLE}\\.(?:png|webp)$`,
);
const CHARACTER_FILE = new RegExp(
  `^${NPC_ENTITY}-(?:main-image|pixel-character|pixel-profile|poster)\\.(?:png|webp)$`,
);
const FORBIDDEN_PIPELINE_NAME =
  /(?:^exec-|^call[_-]|^generated-image(?:[-_].*)?\.|^(?:image-\d+|screenshot(?:[-_].*)?|img[_-]\d+)\.|^\d{8}(?:[-_]\d+)?\.|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|(?:^|[-_])(?:cutout|maria-style|qa|source)(?:[-_.]|$))/i;

const REFERENCE_ROOTS = [
  "app",
  "components",
  "discord-notice",
  "hooks",
  "lib",
  "scripts",
  "styles",
  "types",
];

function result(errors = [], legacy = []) {
  return { errors, legacy };
}

function namingError(relativePath, expected) {
  return `${relativePath}: ${expected}`;
}

export function validateAssetRelativePath(relativePath) {
  const normalized = relativePath.replaceAll(path.sep, "/");
  const basename = path.posix.basename(normalized);

  if (FORBIDDEN_PIPELINE_NAME.test(basename)) {
    return result([
      namingError(
        normalized,
        "실행 ID나 생성 공정명이 아닌 엔티티·역할 기반 파일명을 사용해야 합니다.",
      ),
    ]);
  }

  if (/^StarGate_logo(?:_old|_watermark)?\.(?:png|webp)$/.test(normalized)) {
    return result([], [
      `${normalized}: 기존 브랜드 루트 파일명(신규 파일에는 lower-kebab 사용)`,
    ]);
  }

  const [domain, ...restParts] = normalized.split("/");
  const rest = restParts.join("/");
  let valid = false;

  switch (domain) {
    case "catalog":
      valid = /^(?:consumables|equipment|samples|special)\//.test(rest) &&
        LOWER_KEBAB_FILE.test(rest.split("/").at(-1) ?? "") &&
        restParts.length === 2;
      break;
    case "equipment-shop":
      if (rest === "training-target.webp") {
        return result([], [
          `${normalized}: 기존 루트 자산(신규 자산은 rooms/ 또는 simulator/ 사용)`,
        ]);
      }
      valid = /^(?:rooms|simulator)\//.test(rest) &&
        RASTER_LOWER_KEBAB_FILE.test(rest.split("/").at(-1) ?? "") &&
        restParts.length === 2;
      break;
    case "events":
    case "og":
    case "research":
    case "stocks":
      valid = restParts.length === 1 && RASTER_LOWER_KEBAB_FILE.test(rest);
      break;
    case "faction":
      valid =
        restParts.length === 1 &&
        /^[a-z0-9]+(?:_[a-z0-9]+)*_logo\.(?:png|webp)$/.test(rest);
      break;
    case "npcs":
      valid =
        (restParts.length === 1 && NPC_TOP_LEVEL_FILE.test(rest)) ||
        (restParts.length === 3 &&
          /^[a-z0-9]+(?:-[a-z0-9]+)*\/(?:portraits|relationship)\/[a-z0-9]+(?:-[a-z0-9]+)*\.(?:png|webp)$/.test(
            rest,
          ));
      break;
    case "peoples":
      valid = restParts.length === 1 && CHARACTER_FILE.test(rest);
      break;
    case "session-reports":
      valid =
        restParts.length === 2 &&
        /^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*\.(?:avif|gif|jpe?g|png|webp)$/.test(
          rest,
        );
      break;
    case "shop":
      valid =
        (restParts.length === 1 &&
          /^(?:store-bg|store-closed)\.(?:png|webp)$/.test(rest)) ||
        (restParts.length === 2 &&
          /^(?:events|hud)\//.test(rest) &&
          RASTER_LOWER_KEBAB_FILE.test(restParts[1])) ||
        (restParts.length === 2 &&
          restParts[0] === "items" &&
          SHOP_ITEM_FILE.test(restParts[1]));
      break;
    case "svg":
      valid =
        restParts.length === 1 &&
        /^(?:ic|org)_[a-z0-9]+(?:[-_][a-z0-9]+)*\.svg$/.test(rest);
      break;
    case "wiki":
      valid =
        restParts.length === 2 &&
        /^(?:entities|places)\//.test(rest) &&
        RASTER_LOWER_KEBAB_FILE.test(restParts[1]);
      break;
    case "world-view":
      if (/^wolrdview_[1-6]\.webp$/.test(rest)) {
        return result([], [
          `${normalized}: 기존 오탈자 파일명(참조 마이그레이션과 함께 별도 정리)`,
        ]);
      }
      valid = restParts.length === 1 && RASTER_LOWER_KEBAB_FILE.test(rest);
      break;
    default:
      valid = false;
  }

  return valid
    ? result()
    : result([
        namingError(
          normalized,
          "도메인별 lower-kebab/역할 규약에 맞지 않습니다.",
        ),
      ]);
}

export function extractAssetReferences(source) {
  return [...source.matchAll(ASSET_REFERENCE)].map((match) =>
    match[0].replace(/\?.*$/, ""),
  );
}

export function findMissingAssetReferences(referenceEntries, assetPaths) {
  const missingByPath = new Map();

  for (const entry of referenceEntries) {
    for (const reference of entry.references) {
      const optimizedReference = reference.replace(/\.(?:png|jpe?g)$/i, ".webp");
      if (
        assetPaths.has(reference) ||
        (optimizedReference !== reference && assetPaths.has(optimizedReference))
      ) {
        continue;
      }
      const files = missingByPath.get(reference) ?? new Set();
      files.add(entry.filePath);
      missingByPath.set(reference, files);
    }
  }

  return [...missingByPath.entries()].map(([reference, files]) => ({
    files: [...files].sort(),
    reference,
  }));
}

export function findStaleRenamedReferences(renamePairs, referenceEntries) {
  const stale = [];

  for (const rename of renamePairs) {
    const oldPublicPath = rename.from.replace(/^public/, "");
    for (const entry of referenceEntries) {
      if (entry.references.includes(oldPublicPath)) {
        stale.push({
          filePath: entry.filePath,
          from: oldPublicPath,
          to: rename.to.replace(/^public/, ""),
        });
      }
    }
  }

  return stale;
}

async function walkFiles(directory, predicate, output = []) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return output;
    throw error;
  }

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      await walkFiles(absolutePath, predicate, output);
    } else if (entry.isFile() && predicate(absolutePath)) {
      output.push(absolutePath);
    }
  }
  return output;
}

function loadWorkingTreeAssetRenames(repoRoot) {
  const output = execFileSync(
    "git",
    [
      "diff",
      "--relative",
      "--name-status",
      "--find-renames",
      "HEAD",
      "--",
      "public/assets",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  ).trim();

  if (!output) return [];
  return output
    .split("\n")
    .map((line) => line.split("\t"))
    .filter(([status]) => /^R\d+$/.test(status))
    .map(([, from, to]) => ({ from, to }));
}

async function loadReferenceEntries(repoRoot) {
  const files = [];
  for (const root of REFERENCE_ROOTS) {
    await walkFiles(
      path.join(repoRoot, root),
      (filePath) =>
        SOURCE_EXTENSION.test(filePath) &&
        !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(filePath) &&
        !filePath.endsWith(path.join("components", "icons", "README.md")),
      files,
    );
  }
  await walkFiles(
    path.join(repoRoot, "docs"),
    (filePath) => SOURCE_EXTENSION.test(filePath),
    files,
  );

  const referenceEntries = [];
  for (const filePath of files) {
    const references = extractAssetReferences(await readFile(filePath, "utf8"));
    if (references.length === 0) continue;
    referenceEntries.push({
      filePath: path.relative(repoRoot, filePath).replaceAll(path.sep, "/"),
      references: [...new Set(references)],
    });
  }
  return referenceEntries;
}

export async function auditPublicAssets(repoRoot) {
  const assetRoot = path.join(repoRoot, "public", "assets");
  const imageFiles = await walkFiles(assetRoot, (filePath) =>
    IMAGE_EXTENSION.test(filePath),
  );
  const relativePaths = imageFiles
    .map((filePath) => path.relative(assetRoot, filePath).replaceAll(path.sep, "/"))
    .sort();
  const assetPaths = new Set(relativePaths.map((filePath) => `/assets/${filePath}`));
  const referenceEntries = await loadReferenceEntries(repoRoot);
  referenceEntries.push({
    filePath: "lib/assets/registry.ts (resolved AssetSpec paths)",
    references: PUBLIC_ASSET_REGISTRY_PATHS.map((assetPath) =>
      assetPath.replace(/\?.*$/, ""),
    ),
  });
  const errors = [];
  const legacy = [];

  for (const relativePath of relativePaths) {
    const validation = validateAssetRelativePath(relativePath);
    errors.push(
      ...validation.errors.map((message) => ({
        code: "INVALID_NAME",
        message,
      })),
    );
    legacy.push(...validation.legacy);
  }

  for (const relativePath of relativePaths) {
    if (!/\.(?:png|jpe?g)$/i.test(relativePath)) continue;
    const webpPath = relativePath.replace(/\.(?:png|jpe?g)$/i, ".webp");
    if (!assetPaths.has(`/assets/${webpPath}`)) {
      errors.push({
        code: "MISSING_WEBP_SIDECAR",
        message: `${relativePath}: 배포용 WebP 대응본이 없습니다.`,
      });
    }
  }

  for (const missing of findMissingAssetReferences(referenceEntries, assetPaths)) {
    errors.push({
      code: "MISSING_REFERENCE",
      message: `${missing.reference}: 참조 파일이 없습니다 (${missing.files.join(", ")})`,
    });
  }

  for (const slug of KNOWN_CHARACTER_ASSET_SLUGS) {
    for (const role of ["main-image", "pixel-character", "pixel-profile"]) {
      const publicPath = `/assets/peoples/${slug}-${role}.webp`;
      if (!assetPaths.has(publicPath)) {
        errors.push({
          code: "INCOMPLETE_CHARACTER_SET",
          message: `${publicPath}: 플레이어블 캐릭터 핵심 WebP 세트가 불완전합니다.`,
        });
      }
    }
  }

  const renames = loadWorkingTreeAssetRenames(repoRoot);
  for (const stale of findStaleRenamedReferences(renames, referenceEntries)) {
    errors.push({
      code: "STALE_RENAMED_REFERENCE",
      message: `${stale.filePath}: ${stale.from} → ${stale.to} rename을 반영해야 합니다.`,
    });
  }

  return {
    assetCount: relativePaths.length,
    errors,
    legacy,
    referenceCount: new Set(
      referenceEntries.flatMap((entry) => entry.references),
    ).size,
    referenceFileCount: referenceEntries.length,
    renames,
  };
}
