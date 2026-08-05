/** Expiring, machine-verifiable guard for legacy live-only renderer targets. */

import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { MongoClient, type Document } from "mongodb";

import {
  baselineDocumentLabels,
  hashStaticBaselineDocument,
  STATIC_BASELINE_COLLECTIONS,
  validateStaticLoreBaseline,
} from "./lib/static-lore-baseline.ts";

function loadEnvFile(name: string): void {
  try {
    for (const line of readFileSync(resolve(process.cwd(), name), "utf8").split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator === -1) continue;
      const key = trimmed.slice(0, separator).trim();
      let value = trimmed.slice(separator + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] ??= value;
    }
  } catch {
    // Optional for offline verification.
  }
}

function option(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

function durablePayloadTargets(root: string): Set<string> {
  const targets = new Set<string>();
  for (const name of readdirSync(root).filter((value) => value.endsWith(".json"))) {
    const raw = JSON.parse(readFileSync(resolve(root, name), "utf8")) as unknown;
    for (const entry of Array.isArray(raw) ? raw : [raw]) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const envelope = entry as Record<string, unknown>;
      if (!envelope.payload || typeof envelope.payload !== "object" || Array.isArray(envelope.payload)) continue;
      const payload = envelope.payload as Record<string, unknown>;
      const mapping = Object.entries(STATIC_BASELINE_COLLECTIONS).find(
        ([, config]) => config.collection === envelope.collection,
      );
      if (!mapping) continue;
      const [kind, config] = mapping;
      if (typeof payload[config.keyField] === "string") {
        targets.add(`${kind}:${payload[config.keyField]}`);
      }
    }
  }
  return targets;
}

const baselinePath = resolve(option("--baseline", "../docs/lore/static-target-baseline.json"));
const payloadRoot = resolve(option("--payload-root", "scripts/seed-payloads"));
const verifyLive = process.argv.includes("--verify-live");
const emitObservation = process.argv.includes("--emit-live-observation");
const baseline = validateStaticLoreBaseline(
  JSON.parse(readFileSync(baselinePath, "utf8")),
);
const durable = durablePayloadTargets(payloadRoot);
const redundant = baseline.targets
  .map((target) => `${target.kind}:${target.key}`)
  .filter((identity) => durable.has(identity));
if (redundant.length > 0) {
  throw new Error(`[static-baseline] durable payload가 생긴 target은 baseline에서 제거하세요: ${redundant.join(", ")}`);
}

if (!verifyLive && !emitObservation) {
  console.log(JSON.stringify({ mode: "offline", targets: baseline.targets.length, expiresAt: baseline.expiresAt }));
  process.exit(0);
}

loadEnvFile(".env.local");
loadEnvFile(".env");
const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME ?? process.env.MONGODB_DB_NAME ?? "stargate";
if (!uri) throw new Error("[static-baseline] live verification에는 MONGODB_URI가 필요합니다.");
if (dbName !== baseline.database) {
  throw new Error(`[static-baseline] database 불일치: baseline=${baseline.database} actual=${dbName}`);
}

const client = new MongoClient(uri);
await client.connect();
try {
  const db = client.db(dbName);
  const observations: Array<Record<string, unknown>> = [];
  for (const target of baseline.targets) {
    const config = STATIC_BASELINE_COLLECTIONS[target.kind];
    const document = await db.collection<Document>(config.collection).findOne({
      [config.keyField]: target.key,
    });
    if (!document) throw new Error(`[static-baseline] live target 없음: ${target.kind}:${target.key}`);
    const updatedAt = document.updatedAt instanceof Date
      ? document.updatedAt.toISOString()
      : new Date(String(document.updatedAt ?? "")).toISOString();
    const contentHash = hashStaticBaselineDocument(document);
    const labels = baselineDocumentLabels(target, document);
    for (const alias of target.aliases) {
      if (!labels.has(alias.normalize("NFKC").trim().toLocaleLowerCase())) {
        throw new Error(`[static-baseline] live label과 baseline alias 불일치: ${target.kind}:${target.key}`);
      }
    }
    observations.push({ kind: target.kind, key: target.key, observedUpdatedAt: updatedAt, contentHash });
    if (!emitObservation && (updatedAt !== target.observedUpdatedAt || contentHash !== target.contentHash)) {
      throw new Error(`[static-baseline] live target이 baseline 관측 이후 변경됨: ${target.kind}:${target.key}`);
    }
  }
  console.log(JSON.stringify({ mode: emitObservation ? "observation" : "live-verified", database: dbName, observations }, null, 2));
} finally {
  await client.close();
}
