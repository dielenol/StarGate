import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  close,
  ensureAllIndexes,
  getClient,
  initServerless,
} from "@stargate/shared-db";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

function normalizeEnvValue(value: string): string {
  const trimmed = value.trim();
  const quote = trimmed[0];
  if (
    (quote === `"` || quote === `'`) &&
    trimmed.endsWith(quote) &&
    trimmed.length >= 2
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function loadEnvFile(path: string) {
  let envContent = "";
  try {
    envContent = readFileSync(path, "utf-8");
  } catch {
    return;
  }

  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx);
    const val = normalizeEnvValue(trimmed.slice(eqIdx + 1));
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnvFile(resolve(projectRoot, ".env.local"));
loadEnvFile(resolve(projectRoot, ".env"));

const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME ?? "stargate";

if (!uri) {
  console.error("MONGODB_URI is required.");
  process.exit(1);
}

function withDefaultUriOptions(
  rawUri: string,
  defaults: Record<string, string>,
): string {
  const [base, query = ""] = rawUri.split("?", 2);
  const params = new URLSearchParams(query);
  for (const [key, value] of Object.entries(defaults)) {
    if (!params.has(key)) params.set(key, value);
  }
  const nextQuery = params.toString();
  return nextQuery ? `${base}?${nextQuery}` : base;
}

const indexUri = withDefaultUriOptions(uri, {
  connectTimeoutMS: "15000",
  serverSelectionTimeoutMS: "15000",
});

initServerless({ uri: indexUri, dbName, maxPoolSize: 5 });

try {
  console.log("Ensuring MongoDB indexes...");
  await ensureAllIndexes();
  console.log("MongoDB indexes are up to date.");
} finally {
  const client = await getClient().catch(() => null);
  await client?.close();
  await close();
}
