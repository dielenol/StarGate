import { access, rm } from "node:fs/promises";
import { basename, resolve } from "node:path";

const packageRoot = resolve(process.cwd());
const packageJson = resolve(packageRoot, "package.json");
const dist = resolve(packageRoot, "dist");

await access(packageJson);
if (basename(dist) !== "dist" || !dist.startsWith(`${packageRoot}/`)) {
  throw new Error("REFUSING_TO_CLEAN_UNSAFE_DIST_PATH");
}
await rm(dist, { recursive: true, force: true });
