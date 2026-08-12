import { access, mkdir } from "node:fs/promises";
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

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function publishAsset({
  inputPath,
  overwrite = false,
  projectRoot = REPO_ROOT,
  quality = 90,
  spec,
}: PublishAssetOptions): Promise<{
  filePath: string;
  publicPath: `/assets/${string}`;
}> {
  if (!Number.isInteger(quality) || quality < 1 || quality > 100) {
    throw new Error(`--quality는 1~100 정수여야 합니다: ${quality}`);
  }

  const absoluteInputPath = path.resolve(inputPath);
  if (!(await exists(absoluteInputPath))) {
    throw new Error(`입력 이미지를 찾을 수 없습니다: ${absoluteInputPath}`);
  }

  const destination = resolveAssetDestination({ ...spec, format: "webp" });
  const absoluteOutputPath = path.resolve(projectRoot, destination.filePath);
  if (absoluteInputPath === absoluteOutputPath) {
    throw new Error("입력과 출력 경로가 같습니다. staging 파일을 입력으로 사용하세요.");
  }
  if (!overwrite && (await exists(absoluteOutputPath))) {
    throw new Error(
      `기존 자산을 덮어쓰지 않습니다: ${absoluteOutputPath} (명시적으로 교체할 때만 --overwrite)`,
    );
  }

  await mkdir(path.dirname(absoluteOutputPath), { recursive: true });
  await sharp(absoluteInputPath)
    .rotate()
    .webp({ alphaQuality: 100, effort: 6, quality })
    .toFile(absoluteOutputPath);

  return {
    publicPath: destination.publicPath,
    filePath: absoluteOutputPath,
  };
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
