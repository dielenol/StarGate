#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

import { auditPublicAssets } from "./lib/public-asset-audit.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const report = await auditPublicAssets(repoRoot);

console.log(
  `이미지 ${report.assetCount}개 · 고유 참조 ${report.referenceCount}개 (${report.referenceFileCount}개 파일)`,
);

if (report.legacy.length > 0) {
  console.log(`점진적 마이그레이션 예외 ${report.legacy.length}개:`);
  for (const message of report.legacy) console.log(`  - ${message}`);
}

if (report.renames.length > 0) {
  console.log("자산 rename 감지(DB previewImage/mainImage/posterImage도 확인 필요):");
  for (const rename of report.renames) {
    console.log(`  - ${rename.from} → ${rename.to}`);
  }
}

if (report.errors.length > 0) {
  console.error(`이미지 자산 감사 실패: ${report.errors.length}건`);
  for (const error of report.errors) {
    console.error(`  - [${error.code}] ${error.message}`);
  }
  process.exitCode = 1;
} else {
  console.log("이미지 자산 감사 통과");
}
