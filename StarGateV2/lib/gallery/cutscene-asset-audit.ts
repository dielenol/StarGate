import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import sharp, { type Metadata } from "sharp";

const CUT_FILE_PATTERN = /^cut-(\d{3})\.webp$/;
const CUT_PREFIX_PATTERN = /^cut-/i;
const STORAGE_FOLDER_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface CutsceneAuditShot {
  file: string;
  width: number;
  height: number;
}

export interface CutsceneAuditAlbum {
  folder: string;
  shots: readonly CutsceneAuditShot[];
}

export type CutsceneAuditManifest = Readonly<
  Record<string, CutsceneAuditAlbum>
>;

export type CutsceneAuditSeverity = "error" | "warning";

export type CutsceneAuditFindingCode =
  | "assets_root_unreadable"
  | "duplicate_manifest_path"
  | "exact_duplicate_content"
  | "file_too_large"
  | "image_read_failed"
  | "invalid_cut_name"
  | "invalid_cut_path"
  | "invalid_manifest_folder"
  | "legacy_alpha_near_opaque"
  | "legacy_alpha_regressed"
  | "legacy_alpha_stale_changed"
  | "legacy_alpha_stale_missing"
  | "legacy_alpha_stale_opaque"
  | "legacy_alpha_transparent"
  | "long_edge_exceeded"
  | "manifest_dimension_mismatch"
  | "missing_manifest_file"
  | "non_opaque_alpha"
  | "not_single_frame"
  | "not_srgb"
  | "not_webp"
  | "orphan_cut_file";

export interface CutsceneAuditFinding {
  severity: CutsceneAuditSeverity;
  code: CutsceneAuditFindingCode;
  message: string;
  path?: string;
  paths?: readonly string[];
  sessionId?: string;
  expected?: unknown;
  actual?: unknown;
}

export interface CutsceneFolderAudit {
  /** Storage namespace only; sharing a folder does not imply story continuity. */
  folder: string;
  sessionIds: readonly string[];
  manifestEntries: number;
  actualCutFiles: number;
  maxCutId: number;
  nextCutId: number;
  nextFile: string;
}

export interface CutsceneAssetAuditResult {
  schemaVersion: 1;
  ok: boolean;
  scope: {
    publicBasePath: string;
    folderSemantics: "storage-namespace-only";
  };
  summary: {
    manifestEntries: number;
    uniqueManifestPaths: number;
    actualCutFiles: number;
    errors: number;
    warnings: number;
    legacyAlphaTransparent: number;
    legacyAlphaNearOpaque: number;
    staleLegacyAlpha: number;
    exactDuplicateGroups: number;
  };
  folders: readonly CutsceneFolderAudit[];
  findings: readonly CutsceneAuditFinding[];
}

export interface AuditCutsceneAssetsOptions {
  manifest: CutsceneAuditManifest;
  assetsRoot: string;
  legacyAlphaAllowlist?: Readonly<Record<string, number>>;
  publicBasePath?: string;
  maxBytes?: number;
  maxLongEdge?: number;
}

interface ManifestEntry {
  sessionId: string;
  folder: string;
  shot: CutsceneAuditShot;
  relativePath: string;
  publicPath: string;
  cutId: number;
}

interface ActualCutFile {
  absolutePath: string;
  folder: string;
  relativePath: string;
  publicPath: string;
  cutId: number;
}

function toPublicPath(publicBasePath: string, relativePath: string): string {
  return path.posix.join(publicBasePath, relativePath);
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

async function collectFiles(
  directory: string,
  relativeDirectory = "",
): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(path.join(directory, entry.name), relativePath)));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files;
}

function compareFindings(
  left: CutsceneAuditFinding,
  right: CutsceneAuditFinding,
): number {
  const severity = left.severity === right.severity
    ? 0
    : left.severity === "error"
      ? -1
      : 1;
  if (severity !== 0) return severity;
  return (
    left.code.localeCompare(right.code) ||
    (left.path ?? left.paths?.join("\0") ?? "").localeCompare(
      right.path ?? right.paths?.join("\0") ?? "",
    ) ||
    left.message.localeCompare(right.message)
  );
}

function validateMetadata(
  actual: ActualCutFile,
  metadata: Metadata,
  bytes: number,
  maxBytes: number,
  maxLongEdge: number,
  findings: CutsceneAuditFinding[],
): void {
  if (metadata.format !== "webp") {
    findings.push({
      severity: "error",
      code: "not_webp",
      path: actual.publicPath,
      expected: "webp",
      actual: metadata.format ?? null,
      message: "컷신 파일의 실제 포맷이 WebP가 아닙니다.",
    });
  }
  const pages = metadata.pages ?? 1;
  if (pages !== 1) {
    findings.push({
      severity: "error",
      code: "not_single_frame",
      path: actual.publicPath,
      expected: 1,
      actual: pages,
      message: "컷신은 단일 프레임이어야 합니다.",
    });
  }
  if (metadata.space !== "srgb") {
    findings.push({
      severity: "error",
      code: "not_srgb",
      path: actual.publicPath,
      expected: "srgb",
      actual: metadata.space ?? null,
      message: "컷신 색공간이 sRGB가 아닙니다.",
    });
  }
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (Math.max(width, height) > maxLongEdge) {
    findings.push({
      severity: "error",
      code: "long_edge_exceeded",
      path: actual.publicPath,
      expected: { maxLongEdge },
      actual: { width, height },
      message: `컷신 장변이 ${maxLongEdge}px 제한을 초과합니다.`,
    });
  }
  if (bytes > maxBytes) {
    findings.push({
      severity: "error",
      code: "file_too_large",
      path: actual.publicPath,
      expected: { maxBytes },
      actual: { bytes },
      message: `컷신 파일이 ${maxBytes}바이트 제한을 초과합니다.`,
    });
  }
}

export async function auditCutsceneAssets({
  manifest,
  assetsRoot,
  legacyAlphaAllowlist = {},
  publicBasePath = "/assets/session-reports",
  maxBytes = 1024 * 1024,
  maxLongEdge = 1400,
}: AuditCutsceneAssetsOptions): Promise<CutsceneAssetAuditResult> {
  const findings: CutsceneAuditFinding[] = [];
  const manifestEntries: ManifestEntry[] = [];
  const manifestEntriesByPath = new Map<string, ManifestEntry[]>();
  const sessionIdsByFolder = new Map<string, Set<string>>();
  const manifestCutIdsByFolder = new Map<string, number[]>();

  for (const [sessionId, album] of Object.entries(manifest)) {
    if (!STORAGE_FOLDER_PATTERN.test(album.folder)) {
      findings.push({
        severity: "error",
        code: "invalid_manifest_folder",
        sessionId,
        expected: "단일 lower-kebab storage segment",
        actual: album.folder,
        message: "manifest folder는 점, 슬래시, 역슬래시가 없는 단일 lower-kebab segment여야 합니다.",
      });
      continue;
    }
    const sessionIds = sessionIdsByFolder.get(album.folder) ?? new Set<string>();
    sessionIds.add(sessionId);
    sessionIdsByFolder.set(album.folder, sessionIds);

    for (const shot of album.shots) {
      const match = CUT_FILE_PATTERN.exec(shot.file);
      if (!match || Number(match[1]) < 1) {
        findings.push({
          severity: "error",
          code: "invalid_cut_name",
          sessionId,
          path: toPublicPath(publicBasePath, path.posix.join(album.folder, shot.file)),
          expected: "cut-NNN.webp (NNN >= 001)",
          actual: shot.file,
          message: "manifest 컷신 파일명이 규격과 다릅니다.",
        });
        continue;
      }
      const cutId = Number(match[1]);
      const relativePath = path.posix.join(album.folder, shot.file);
      const entry: ManifestEntry = {
        sessionId,
        folder: album.folder,
        shot,
        relativePath,
        publicPath: toPublicPath(publicBasePath, relativePath),
        cutId,
      };
      manifestEntries.push(entry);
      const entries = manifestEntriesByPath.get(relativePath) ?? [];
      entries.push(entry);
      manifestEntriesByPath.set(relativePath, entries);
      const ids = manifestCutIdsByFolder.get(album.folder) ?? [];
      ids.push(cutId);
      manifestCutIdsByFolder.set(album.folder, ids);
    }
  }

  for (const entries of manifestEntriesByPath.values()) {
    if (entries.length < 2) continue;
    findings.push({
      severity: "error",
      code: "duplicate_manifest_path",
      path: entries[0]?.publicPath,
      expected: "manifest path당 단일 entry",
      actual: entries.map(({ sessionId }) => sessionId),
      message: "여러 session manifest entry가 같은 컷신 경로를 가리킵니다.",
    });
  }

  let discoveredFiles: string[] = [];
  try {
    discoveredFiles = await collectFiles(assetsRoot);
  } catch (reason) {
    findings.push({
      severity: "error",
      code: "assets_root_unreadable",
      path: assetsRoot,
      message: `컷신 자산 루트를 읽지 못했습니다: ${errorMessage(reason)}`,
    });
  }

  const actualCuts = new Map<string, ActualCutFile>();
  for (const relativePath of discoveredFiles) {
    const basename = path.posix.basename(relativePath);
    if (!CUT_PREFIX_PATTERN.test(basename)) continue;
    const segments = relativePath.split("/");
    const match = CUT_FILE_PATTERN.exec(basename);
    if (!match || Number(match[1]) < 1) {
      findings.push({
        severity: "error",
        code: "invalid_cut_name",
        path: toPublicPath(publicBasePath, relativePath),
        expected: "cut-NNN.webp (NNN >= 001)",
        actual: basename,
        message: "실제 컷신 파일명이 규격과 다릅니다.",
      });
      continue;
    }
    if (segments.length !== 2) {
      findings.push({
        severity: "error",
        code: "invalid_cut_path",
        path: toPublicPath(publicBasePath, relativePath),
        expected: "<folder>/cut-NNN.webp",
        actual: relativePath,
        message: "컷신 파일은 세션 보고서 바로 아래 폴더 한 단계에 있어야 합니다.",
      });
      continue;
    }
    actualCuts.set(relativePath, {
      absolutePath: path.join(assetsRoot, ...segments),
      folder: segments[0]!,
      relativePath,
      publicPath: toPublicPath(publicBasePath, relativePath),
      cutId: Number(match[1]),
    });
  }

  for (const [relativePath, entries] of manifestEntriesByPath) {
    if (actualCuts.has(relativePath)) continue;
    findings.push({
      severity: "error",
      code: "missing_manifest_file",
      path: entries[0]?.publicPath,
      actual: { sessionIds: entries.map(({ sessionId }) => sessionId) },
      message: "manifest가 가리키는 컷신 파일이 없습니다.",
    });
  }

  for (const actual of actualCuts.values()) {
    if (manifestEntriesByPath.has(actual.relativePath)) continue;
    findings.push({
      severity: "error",
      code: "orphan_cut_file",
      path: actual.publicPath,
      message: "어떤 session manifest entry도 이 컷신 파일을 가리키지 않습니다.",
    });
  }

  const alphaByPublicPath = new Map<string, number>();
  const hashes = new Map<string, string[]>();
  const metadataByRelativePath = new Map<string, Metadata>();

  for (const actual of [...actualCuts.values()].sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  )) {
    let bytes: Buffer;
    try {
      bytes = await readFile(actual.absolutePath);
    } catch (reason) {
      findings.push({
        severity: "error",
        code: "image_read_failed",
        path: actual.publicPath,
        message: `컷신 파일을 읽지 못했습니다: ${errorMessage(reason)}`,
      });
      continue;
    }

    const digest = createHash("sha256").update(bytes).digest("hex");
    const digestPaths = hashes.get(digest) ?? [];
    digestPaths.push(actual.publicPath);
    hashes.set(digest, digestPaths);

    let metadata: Metadata;
    try {
      metadata = await sharp(bytes, { animated: true }).metadata();
      metadataByRelativePath.set(actual.relativePath, metadata);
    } catch (reason) {
      findings.push({
        severity: "error",
        code: "image_read_failed",
        path: actual.publicPath,
        message: `컷신 이미지 메타데이터를 읽지 못했습니다: ${errorMessage(reason)}`,
      });
      continue;
    }

    validateMetadata(actual, metadata, bytes.byteLength, maxBytes, maxLongEdge, findings);

    if (!metadata.hasAlpha) {
      alphaByPublicPath.set(actual.publicPath, 255);
      continue;
    }
    try {
      const stats = await sharp(bytes, { animated: true }).stats();
      alphaByPublicPath.set(actual.publicPath, stats.channels.at(-1)?.min ?? 255);
    } catch (reason) {
      findings.push({
        severity: "error",
        code: "image_read_failed",
        path: actual.publicPath,
        message: `컷신 알파 채널을 읽지 못했습니다: ${errorMessage(reason)}`,
      });
    }
  }

  for (const entry of manifestEntries) {
    const metadata = metadataByRelativePath.get(entry.relativePath);
    if (!metadata) continue;
    if (metadata.width === entry.shot.width && metadata.height === entry.shot.height) {
      continue;
    }
    findings.push({
      severity: "error",
      code: "manifest_dimension_mismatch",
      sessionId: entry.sessionId,
      path: entry.publicPath,
      expected: { width: entry.shot.width, height: entry.shot.height },
      actual: { width: metadata.width ?? null, height: metadata.height ?? null },
      message: "manifest 치수와 실제 이미지 치수가 다릅니다.",
    });
  }

  for (const [digest, publicPaths] of hashes) {
    if (publicPaths.length < 2) continue;
    findings.push({
      severity: "warning",
      code: "exact_duplicate_content",
      paths: [...publicPaths].sort(),
      actual: { sha256: digest },
      message: "서로 다른 컷신 경로가 완전히 같은 SHA-256 내용을 가집니다.",
    });
  }

  for (const [publicPath, minAlpha] of alphaByPublicPath) {
    const expectedLegacyAlpha = legacyAlphaAllowlist[publicPath];
    if (minAlpha >= 255) {
      if (expectedLegacyAlpha !== undefined) {
        findings.push({
          severity: "warning",
          code: "legacy_alpha_stale_opaque",
          path: publicPath,
          expected: { legacyMinAlpha: expectedLegacyAlpha },
          actual: { minAlpha },
          message: "legacy alpha 예외가 이제 불투명하므로 allowlist에서 제거할 수 있습니다.",
        });
      }
      continue;
    }
    if (expectedLegacyAlpha === undefined) {
      findings.push({
        severity: "error",
        code: "non_opaque_alpha",
        path: publicPath,
        expected: { minAlpha: 255 },
        actual: { minAlpha },
        message: "신규 또는 비허용 컷신에 투명 픽셀이 있습니다.",
      });
      continue;
    }
    if (minAlpha < expectedLegacyAlpha) {
      findings.push({
        severity: "error",
        code: "legacy_alpha_regressed",
        path: publicPath,
        expected: { minAlphaAtLeast: expectedLegacyAlpha },
        actual: { minAlpha },
        message: "legacy 컷신의 알파가 allowlist 기준보다 더 투명해졌습니다.",
      });
      continue;
    }
    if (minAlpha > expectedLegacyAlpha) {
      findings.push({
        severity: "warning",
        code: "legacy_alpha_stale_changed",
        path: publicPath,
        expected: { legacyMinAlpha: expectedLegacyAlpha },
        actual: { minAlpha },
        message: "legacy 컷신의 알파가 기준보다 개선됐지만 아직 불투명하지 않아 allowlist 갱신이 필요합니다.",
      });
      continue;
    }
    findings.push({
      severity: "warning",
      code: minAlpha === 0
        ? "legacy_alpha_transparent"
        : "legacy_alpha_near_opaque",
      path: publicPath,
      expected: { opaqueMinAlpha: 255, legacyMinAlpha: expectedLegacyAlpha },
      actual: { minAlpha },
      message: minAlpha === 0
        ? "legacy 컷신에 완전 투명 픽셀이 있습니다."
        : "legacy 컷신이 근불투명 알파를 포함합니다.",
    });
  }

  for (const [publicPath, expectedLegacyAlpha] of Object.entries(legacyAlphaAllowlist)) {
    if (alphaByPublicPath.has(publicPath)) continue;
    findings.push({
      severity: "warning",
      code: "legacy_alpha_stale_missing",
      path: publicPath,
      expected: { legacyMinAlpha: expectedLegacyAlpha },
      message: "legacy alpha allowlist 경로가 없거나 알파를 검사할 수 없습니다.",
    });
  }

  const actualByFolder = new Map<string, ActualCutFile[]>();
  for (const actual of actualCuts.values()) {
    const values = actualByFolder.get(actual.folder) ?? [];
    values.push(actual);
    actualByFolder.set(actual.folder, values);
  }
  const folders = new Set([
    ...sessionIdsByFolder.keys(),
    ...actualByFolder.keys(),
  ]);
  const folderAudits: CutsceneFolderAudit[] = [...folders]
    .sort()
    .map((folder) => {
      const manifestIds = manifestCutIdsByFolder.get(folder) ?? [];
      const actualFiles = actualByFolder.get(folder) ?? [];
      const maxCutId = Math.max(
        0,
        ...manifestIds,
        ...actualFiles.map(({ cutId }) => cutId),
      );
      const nextCutId = maxCutId + 1;
      return {
        folder,
        sessionIds: [...(sessionIdsByFolder.get(folder) ?? [])].sort(),
        manifestEntries: manifestIds.length,
        actualCutFiles: actualFiles.length,
        maxCutId,
        nextCutId,
        nextFile: `cut-${String(nextCutId).padStart(3, "0")}.webp`,
      };
    });

  findings.sort(compareFindings);
  const errors = findings.filter(({ severity }) => severity === "error").length;
  const warnings = findings.length - errors;
  const legacyAlphaTransparent = findings.filter(
    ({ code }) => code === "legacy_alpha_transparent",
  ).length;
  const legacyAlphaNearOpaque = findings.filter(
    ({ code }) => code === "legacy_alpha_near_opaque",
  ).length;
  const staleLegacyAlpha = findings.filter(({ code }) =>
    code === "legacy_alpha_stale_changed" ||
    code === "legacy_alpha_stale_missing" ||
    code === "legacy_alpha_stale_opaque",
  ).length;
  const exactDuplicateGroups = findings.filter(
    ({ code }) => code === "exact_duplicate_content",
  ).length;

  return {
    schemaVersion: 1,
    ok: errors === 0,
    scope: {
      publicBasePath,
      folderSemantics: "storage-namespace-only",
    },
    summary: {
      manifestEntries: Object.values(manifest).reduce(
        (total, album) => total + album.shots.length,
        0,
      ),
      uniqueManifestPaths: manifestEntriesByPath.size,
      actualCutFiles: actualCuts.size,
      errors,
      warnings,
      legacyAlphaTransparent,
      legacyAlphaNearOpaque,
      staleLegacyAlpha,
      exactDuplicateGroups,
    },
    folders: folderAudits,
    findings,
  };
}
