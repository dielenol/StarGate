import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { relative, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const publicRoot = resolve(projectRoot, "public");

const SOURCE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg"]);
const SKIP_DIR_NAMES = new Set([".next", "node_modules"]);

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIR_NAMES.has(entry.name)) continue;
      yield* walk(fullPath);
      continue;
    }
    if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      yield fullPath;
    }
  }
}

async function optimizeImage(sourcePath) {
  const outputPath = sourcePath.replace(/\.(png|jpe?g)$/i, ".webp");
  if (outputPath === sourcePath) return null;

  const sourceStats = await stat(sourcePath);
  const tempPath = `${outputPath}.tmp-${Date.now()}`;

  await mkdir(dirname(outputPath), { recursive: true });
  await sharp(sourcePath, { animated: false, limitInputPixels: false })
    .rotate()
    .webp({
      quality: 72,
      alphaQuality: 82,
      effort: 6,
      smartSubsample: true,
    })
    .toFile(tempPath);

  const outputStats = await stat(tempPath);
  if (outputStats.size >= sourceStats.size) {
    await rm(tempPath, { force: true });
    return {
      sourcePath,
      outputPath,
      sourceBytes: sourceStats.size,
      outputBytes: outputStats.size,
      kept: false,
    };
  }

  await rename(tempPath, outputPath);
  return {
    sourcePath,
    outputPath,
    sourceBytes: sourceStats.size,
    outputBytes: outputStats.size,
    kept: true,
  };
}

const results = [];
for await (const sourcePath of walk(publicRoot)) {
  results.push(await optimizeImage(sourcePath));
}

const completed = results.filter(Boolean);
const kept = completed.filter((result) => result.kept);
const skipped = completed.filter((result) => !result.kept);
const sourceTotal = kept.reduce((sum, result) => sum + result.sourceBytes, 0);
const outputTotal = kept.reduce((sum, result) => sum + result.outputBytes, 0);
const savedTotal = sourceTotal - outputTotal;

console.log(`Scanned ${completed.length} PNG/JPG assets.`);
console.log(`Wrote ${kept.length} WebP sidecars; skipped ${skipped.length} non-beneficial conversions.`);
console.log(
  `Sidecar total: ${(outputTotal / 1024 / 1024).toFixed(2)} MB; comparable source total: ${(sourceTotal / 1024 / 1024).toFixed(2)} MB; saved ${(savedTotal / 1024 / 1024).toFixed(2)} MB.`,
);

for (const result of kept
  .sort((a, b) => b.sourceBytes - a.sourceBytes)
  .slice(0, 20)) {
  const from = relative(publicRoot, result.sourcePath);
  const to = relative(publicRoot, result.outputPath);
  const sourceMb = (result.sourceBytes / 1024 / 1024).toFixed(2);
  const outputMb = (result.outputBytes / 1024 / 1024).toFixed(2);
  console.log(`${from} -> ${to} (${sourceMb} MB -> ${outputMb} MB)`);
}
