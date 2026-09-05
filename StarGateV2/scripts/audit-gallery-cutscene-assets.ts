import path from "node:path";
import { fileURLToPath } from "node:url";

import { auditCutsceneAssets } from "../lib/gallery/cutscene-asset-audit.ts";
import { LEGACY_CUTSCENE_ALPHA_ALLOWLIST } from "../lib/gallery/cutscene-legacy-alpha.ts";
import { SESSION_CUTSCENES } from "../lib/gallery/session-cutscenes.ts";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = await auditCutsceneAssets({
  manifest: SESSION_CUTSCENES,
  assetsRoot: path.join(projectRoot, "public/assets/session-reports"),
  legacyAlphaAllowlist: LEGACY_CUTSCENE_ALPHA_ALLOWLIST,
});

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.ok) process.exitCode = 1;
