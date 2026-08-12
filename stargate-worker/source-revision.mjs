import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const inputs = [
  ".dockerignore",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "packages/core/package.json",
  "packages/core/src",
  "packages/core/tsconfig.json",
  "packages/shared-db/package.json",
  "packages/shared-db/src",
  "packages/shared-db/tsconfig.json",
  "stargate-worker/Dockerfile",
  "stargate-worker/package.json",
  "stargate-worker/source-revision.mjs",
  "stargate-worker/src",
  "stargate-worker/tsconfig.json",
];

async function collectFiles(path) {
  const absolutePath = resolve(repositoryRoot, path);
  const metadata = await stat(absolutePath);
  if (metadata.isFile()) return [path];

  const entries = await readdir(absolutePath, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => collectFiles(`${path}/${entry.name}`)),
  );
  return nested.flat();
}

const files = (await Promise.all(inputs.map(collectFiles))).flat().sort();
const hash = createHash("sha256");
for (const path of files) {
  const normalizedPath = relative(repositoryRoot, resolve(repositoryRoot, path));
  hash.update(normalizedPath);
  hash.update("\0");
  hash.update(await readFile(resolve(repositoryRoot, path)));
  hash.update("\0");
}

process.stdout.write(hash.digest("hex"));
