import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  access,
  link,
  mkdir,
  readFile,
  rename,
  stat,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import sharp from "sharp";

import {
  resolveAssetDestination,
  type AssetPathCliInput,
} from "./asset-path-cli.ts";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

export interface PublishAssetOptions {
  inputPath: string;
  overwrite?: boolean;
  projectRoot?: string;
  quality?: number;
  spec: AssetPathCliInput;
}

export interface PublishAssetReceipt {
  bytes: number;
  filePath: string;
  format: string;
  hasAlpha: boolean;
  height: number;
  opaque: boolean;
  projectRoot: string;
  publicPath: `/assets/${string}`;
  quality: number;
  sha256: string;
  sourceSha256: string;
  width: number;
}

interface InspectedImage {
  autoOrientedHeight: number;
  autoOrientedWidth: number;
  bytes: number;
  format: string;
  hasAlpha: boolean;
  height: number;
  metadataStripped: boolean;
  opaque: boolean;
  pages: number;
  space: string | undefined;
  width: number;
}

const DEFAULT_ASSET_QUALITY = 90;
const SESSION_REPORT_DEFAULT_QUALITY = 78;
const SESSION_REPORT_MAX_BYTES = 1024 * 1024;
const SESSION_REPORT_MAX_LONG_EDGE = 1400;
const SESSION_REPORT_RASTER_FORMATS = new Set([
  "avif",
  "gif",
  "heif",
  "jp2",
  "jpeg",
  "jxl",
  "png",
  "tiff",
  "webp",
]);

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function requiresTransparentPixels(spec: AssetPathCliInput): boolean {
  return spec.domain === "npc" && spec.role === "profile";
}

function isSessionReport(spec: AssetPathCliInput): boolean {
  return spec.domain?.trim() === "session-report";
}

function requirePositiveDimension(
  value: number | undefined,
  label: string,
): number {
  if (!Number.isInteger(value) || !value || value < 1) {
    throw new Error(`이미지 ${label}가 올바른 양의 정수가 아닙니다: ${value}`);
  }
  return value;
}

function isAlreadyExistsError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "EEXIST"
  );
}

async function removeIfPresent(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      (error as NodeJS.ErrnoException).code !== "ENOENT"
    ) {
      throw error;
    }
  }
}

async function sha256File(filePath: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function sha256Bytes(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function readSourceSnapshot(inputPath: string): Promise<Buffer> {
  try {
    return await readFile(inputPath);
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      throw new Error(`입력 이미지를 찾을 수 없습니다: ${inputPath}`);
    }
    throw error;
  }
}

async function inspectImage(input: string | Buffer): Promise<InspectedImage> {
  const image = sharp(input, { animated: true });
  const metadata = await image.metadata();
  const width = requirePositiveDimension(metadata.width, "너비");
  const height = requirePositiveDimension(metadata.height, "높이");
  const pages = metadata.pages ?? 1;
  const hasAlpha = metadata.hasAlpha ?? false;
  let opaque = !hasAlpha;

  if (hasAlpha) {
    const stats = await image.stats();
    const alpha = stats.channels.at(-1);
    opaque = Boolean(alpha && alpha.min >= 255);
  }

  return {
    autoOrientedHeight: metadata.autoOrient?.height ?? height,
    autoOrientedWidth: metadata.autoOrient?.width ?? width,
    bytes: Buffer.isBuffer(input) ? input.byteLength : (await stat(input)).size,
    format: metadata.format ?? "unknown",
    hasAlpha,
    height,
    metadataStripped: !(
      metadata.comments?.length ||
      metadata.exif ||
      metadata.hasProfile ||
      metadata.icc ||
      metadata.iptc ||
      metadata.orientation ||
      metadata.tifftagPhotoshop ||
      metadata.xmp ||
      metadata.xmpAsString
    ),
    opaque,
    pages,
    space: metadata.space,
    width,
  };
}

async function assertSessionReportInput(sourceBytes: Buffer): Promise<{
  height: number;
  width: number;
}> {
  const inspected = await inspectImage(sourceBytes);
  if (!SESSION_REPORT_RASTER_FORMATS.has(inspected.format)) {
    throw new Error(
      `session-report 입력은 지원 가능한 래스터 이미지여야 합니다: ${inspected.format}`,
    );
  }
  if (inspected.pages !== 1) {
    throw new Error(
      `session-report 입력은 정적인 단일 프레임이어야 합니다: ${inspected.pages} frames`,
    );
  }
  if (
    Math.max(inspected.width, inspected.height) > SESSION_REPORT_MAX_LONG_EDGE
  ) {
    throw new Error(
      `session-report 입력의 장변은 ${SESSION_REPORT_MAX_LONG_EDGE}px 이하여야 합니다: ${inspected.width}x${inspected.height}`,
    );
  }
  if (!inspected.opaque) {
    throw new Error("session-report 입력은 모든 픽셀이 완전히 불투명해야 합니다.");
  }
  return {
    height: inspected.autoOrientedHeight,
    width: inspected.autoOrientedWidth,
  };
}

async function assertPublishedOutput(
  outputPath: string,
  sessionInputDimensions?: { height: number; width: number },
): Promise<InspectedImage> {
  const inspected = await inspectImage(outputPath);
  if (inspected.format !== "webp") {
    throw new Error(`발행 출력 형식이 WebP가 아닙니다: ${inspected.format}`);
  }

  if (sessionInputDimensions) {
    if (inspected.pages !== 1) {
      throw new Error("session-report 출력은 정적인 단일 프레임이어야 합니다.");
    }
    if (
      inspected.width !== sessionInputDimensions.width ||
      inspected.height !== sessionInputDimensions.height
    ) {
      throw new Error(
        `session-report 출력 크기가 입력과 다릅니다: ${inspected.width}x${inspected.height}`,
      );
    }
    if (inspected.space !== "srgb") {
      throw new Error(
        `session-report 출력 색공간은 sRGB여야 합니다: ${inspected.space ?? "unknown"}`,
      );
    }
    if (!inspected.opaque) {
      throw new Error("session-report 출력은 완전히 불투명해야 합니다.");
    }
    if (!inspected.metadataStripped) {
      throw new Error("session-report 출력 메타데이터가 제거되지 않았습니다.");
    }
    if (inspected.bytes > SESSION_REPORT_MAX_BYTES) {
      throw new Error(
        `session-report 출력은 1 MiB 이하여야 합니다: ${inspected.bytes} bytes`,
      );
    }
  }

  return inspected;
}

async function assertRequiredTransparency(
  sourceBytes: Buffer,
  spec: AssetPathCliInput,
): Promise<void> {
  if (!requiresTransparentPixels(spec)) return;

  const image = sharp(sourceBytes);
  const metadata = await image.metadata();
  if (!metadata.hasAlpha) {
    throw new Error(
      "NPC profile 자산은 local-cutout QA를 통과한 실제 투명 픽셀이 필요합니다.",
    );
  }

  const stats = await image.stats();
  const alpha = stats.channels.at(-1);
  if (!alpha || alpha.min >= 255) {
    throw new Error(
      "NPC profile 자산은 local-cutout QA를 통과한 실제 투명 픽셀이 필요합니다.",
    );
  }
}

export async function publishAsset({
  inputPath,
  overwrite = false,
  projectRoot = REPO_ROOT,
  quality,
  spec,
}: PublishAssetOptions): Promise<PublishAssetReceipt> {
  const sessionReport = isSessionReport(spec);
  const resolvedQuality =
    quality ??
    (sessionReport
      ? SESSION_REPORT_DEFAULT_QUALITY
      : DEFAULT_ASSET_QUALITY);
  if (
    !Number.isInteger(resolvedQuality) ||
    resolvedQuality < 1 ||
    resolvedQuality > 100
  ) {
    throw new Error(`--quality는 1~100 정수여야 합니다: ${resolvedQuality}`);
  }

  const absoluteInputPath = path.resolve(inputPath);
  const absoluteProjectRoot = path.resolve(projectRoot);
  const destination = resolveAssetDestination({ ...spec, format: "webp" });
  const absoluteOutputPath = path.resolve(
    absoluteProjectRoot,
    destination.filePath,
  );
  if (absoluteInputPath === absoluteOutputPath) {
    throw new Error("입력과 출력 경로가 같습니다. staging 파일을 입력으로 사용하세요.");
  }
  if (sessionReport && overwrite) {
    throw new Error(
      "session-report 자산은 append-only이므로 --overwrite를 사용할 수 없습니다.",
    );
  }
  const sourceBytes = await readSourceSnapshot(absoluteInputPath);
  const sourceSha256 = sha256Bytes(sourceBytes);

  const sessionInputDimensions = sessionReport
    ? await assertSessionReportInput(sourceBytes)
    : undefined;
  await assertRequiredTransparency(sourceBytes, spec);

  if (!overwrite && (await exists(absoluteOutputPath))) {
    throw new Error(
      `기존 자산을 덮어쓰지 않습니다: ${absoluteOutputPath} (명시적으로 교체할 때만 --overwrite)`,
    );
  }

  await mkdir(path.dirname(absoluteOutputPath), { recursive: true });
  const temporaryPath = path.join(
    path.dirname(absoluteOutputPath),
    `.${path.basename(absoluteOutputPath)}.${randomUUID()}.tmp.webp`,
  );

  try {
    const image = sharp(sourceBytes);
    const output = sessionReport
      ? image.rotate().removeAlpha().toColourspace("srgb")
      : image.rotate();
    await output
      .webp({ alphaQuality: 100, effort: 6, quality: resolvedQuality })
      .toFile(temporaryPath);

    const inspected = await assertPublishedOutput(
      temporaryPath,
      sessionInputDimensions,
    );
    const sha256 = await sha256File(temporaryPath);

    if (overwrite) {
      await rename(temporaryPath, absoluteOutputPath);
    } else {
      try {
        await link(temporaryPath, absoluteOutputPath);
      } catch (error) {
        if (isAlreadyExistsError(error)) {
          throw new Error(
            `기존 자산을 덮어쓰지 않습니다: ${absoluteOutputPath} (명시적으로 교체할 때만 --overwrite)`,
          );
        }
        throw error;
      }
    }

    return {
      bytes: inspected.bytes,
      filePath: absoluteOutputPath,
      format: inspected.format,
      hasAlpha: inspected.hasAlpha,
      height: inspected.height,
      opaque: inspected.opaque,
      projectRoot: absoluteProjectRoot,
      publicPath: destination.publicPath,
      quality: resolvedQuality,
      sha256,
      sourceSha256,
      width: inspected.width,
    };
  } finally {
    await removeIfPresent(temporaryPath);
  }
}

const USAGE = `사용법:
  pnpm asset:publish -- --input <staging-image> --domain <domain> --entity-slug <slug> [domain options]

설명:
  staging/컷아웃 결과를 프로젝트 역할 기반 경로의 WebP로 발행합니다.
  기존 파일은 기본적으로 덮어쓰지 않습니다.`;

async function run(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] === "--") args.shift();
  const { values } = parseArgs({
    args,
    options: {
      category: { type: "string" },
      collection: { type: "string" },
      domain: { type: "string" },
      "entity-slug": { type: "string" },
      help: { short: "h", type: "boolean" },
      input: { type: "string" },
      overwrite: { type: "boolean" },
      quality: { type: "string" },
      role: { type: "string" },
      section: { type: "string" },
      "session-slug": { type: "string" },
      variant: { type: "string" },
    },
    strict: true,
  });

  if (values.help) {
    console.log(USAGE);
    return;
  }

  const inputPath = values.input?.trim();
  if (!inputPath) throw new Error("--input 옵션이 필요합니다.");
  const published = await publishAsset({
    inputPath,
    overwrite: values.overwrite,
    quality: values.quality ? Number(values.quality) : undefined,
    spec: {
      category: values.category,
      collection: values.collection,
      domain: values.domain,
      entitySlug: values["entity-slug"],
      role: values.role,
      section: values.section,
      sessionSlug: values["session-slug"],
      variant: values.variant,
    },
  });
  console.log(JSON.stringify(published, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await run();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    console.error(USAGE);
    process.exitCode = 1;
  }
}
