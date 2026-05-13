/**
 * _oneoff-fix-image-paths.mjs
 *
 * 캐릭터/NPC 이미지 경로 정리 마이그레이션 (Phase B).
 *
 * 배경:
 *   - peoples/ 한글 슬러그(운연/유회) → 영문 슬러그(Unyeon/Yuhoe) 로 파일명 통일됨
 *   - npcs/ Amalia_Fredrika.png (구 컨벤션) → Amalia-Fredrika-profile.png 로 변경됨
 *   - Phase A 에서 파일 시스템 + 코드(EXPLICIT_CODENAME_TO_SLUG / KNOWN_SLUGS) 영문화 완료
 *   - 이번 Phase B 에서 characters 컬렉션의 DB 경로 필드를 새 파일명에 맞춰 갱신
 *
 * 일회성 fix 이므로 통짜 데이터 갱신과 달리 `bulkUpdatedAt` 은 갱신하지 않는다
 * (`.claude/rules/character-bulk-update.md` 의 통짜 vs 경로 fix 구분 따름).
 * `updatedAt` 만 함께 `$set` 한다.
 *
 * 갱신 대상 필드 (캐릭터 인터페이스 기준):
 *   - previewImage          (CharacterBase 직속)
 *   - pixelCharacterImage   (CharacterBase 직속)
 *   - lore.mainImage        (LoreSheet)
 *   - lore.posterImage      (LoreSheet)
 *   - sheet.mainImage       (legacy NPC 호환)
 *
 * 사용법:
 *   node scripts/_oneoff-fix-image-paths.mjs                  # dry-run (기본, DB 읽기만)
 *   node scripts/_oneoff-fix-image-paths.mjs --execute --yes  # 실제 쓰기 (2-플래그 게이트)
 *   node scripts/_oneoff-fix-image-paths.mjs --execute        # exit 1 (--yes 누락)
 *
 * 환경변수: MONGODB_URI (.env.local 자동 로드, 우선순위는 process.env 가 위).
 *
 * 실행 후 작업: 결과 확인 후 본 파일 즉시 삭제 (`rm`). `_oneoff-*` 패턴은 영구 보관 X.
 *
 * Exit code:
 *   0 = 성공 또는 dry-run 정상 종료
 *   1 = CLI 게이트/사용 오류 (--execute 단독, MONGODB_URI 누락 등)
 *   2 = MongoDB 연결 실패
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import {
  charactersCol,
  getClient,
  initServerless,
} from "@stargate/shared-db";

/* ── 변환 대상 (Phase A 파일 시스템 변경과 1:1 매핑) ── */

const REPLACEMENTS = [
  // peoples 한글 슬러그 → 영문 (운연 → Unyeon)
  {
    from: "/assets/peoples/운연-main-image.png",
    to: "/assets/peoples/Unyeon-main-image.png",
  },
  {
    from: "/assets/peoples/운연-pixel-character.png",
    to: "/assets/peoples/Unyeon-pixel-character.png",
  },
  {
    from: "/assets/peoples/운연-pixel-profile.png",
    to: "/assets/peoples/Unyeon-pixel-profile.png",
  },
  {
    from: "/assets/peoples/운연-poster.webp",
    to: "/assets/peoples/Unyeon-poster.webp",
  },
  // peoples 한글 슬러그 → 영문 (유회 → Yuhoe)
  {
    from: "/assets/peoples/유회-main-image.png",
    to: "/assets/peoples/Yuhoe-main-image.png",
  },
  {
    from: "/assets/peoples/유회-pixel-character.png",
    to: "/assets/peoples/Yuhoe-pixel-character.png",
  },
  {
    from: "/assets/peoples/유회-pixel-profile.png",
    to: "/assets/peoples/Yuhoe-pixel-profile.png",
  },
  {
    from: "/assets/peoples/유회-poster.webp",
    to: "/assets/peoples/Yuhoe-poster.webp",
  },
  // NPC 컨벤션 위반 → <Slug>-profile.png
  {
    from: "/assets/npcs/Amalia_Fredrika.png",
    to: "/assets/npcs/Amalia-Fredrika-profile.png",
  },
];

/** 갱신 대상 필드 (top-level vs nested). 모두 같은 문자열 값 매칭. */
const TARGET_FIELDS = [
  "previewImage",
  "pixelCharacterImage",
  "lore.mainImage",
  "lore.posterImage",
  "sheet.mainImage",
];

/**
 * zero-match 시 비정상으로 판정해야 할 from 경로 set.
 * Phase A 사전 검증에서 운연/유회는 실제 운영 DB 에 적재된 AGENT 슬러그로 확인됨 — 0건이면 비정상.
 * 반면 Amalia NPC 는 아직 DB 미적재 (NPC 적재 단계가 후속) — 0건이 정상.
 */
const EXPECTED_NONZERO = new Set([
  "/assets/peoples/운연-main-image.png",
  "/assets/peoples/운연-pixel-character.png",
  "/assets/peoples/운연-pixel-profile.png",
  "/assets/peoples/운연-poster.webp",
  "/assets/peoples/유회-main-image.png",
  "/assets/peoples/유회-pixel-character.png",
  "/assets/peoples/유회-pixel-profile.png",
  "/assets/peoples/유회-poster.webp",
]);

/* ── .env.local 로드 (seed-factions.ts 와 동일 패턴) ── */

const envPath = resolve(process.cwd(), ".env.local");
try {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx);
    const val = trimmed.slice(eqIdx + 1);
    if (process.env[key] === undefined) process.env[key] = val;
  }
} catch {
  // .env.local 부재 — dry-run 단계에서는 계속 진행, 연결 시점에 분기
}

/* ── CLI 플래그 ── */

const { values: ARGS } = parseArgs({
  options: {
    execute: { type: "boolean", default: false },
    yes: { type: "boolean", default: false },
  },
  // strict: true — 알 수 없는 옵션(오타 등)은 즉시 throw 해서 dry-run 으로 silent 통과 방지.
  strict: true,
});

const EXECUTE = Boolean(ARGS.execute);
const YES = Boolean(ARGS.yes);
const DRY_RUN = !EXECUTE;

if (EXECUTE && !YES) {
  console.error(
    "[fix-image-paths] --execute 시 --yes 로 명시적 확인이 필요합니다.",
  );
  console.error(
    "  실제 쓰기: node scripts/_oneoff-fix-image-paths.mjs --execute --yes",
  );
  console.error("  dry-run 기본: node scripts/_oneoff-fix-image-paths.mjs");
  process.exit(1);
}

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME ?? "stargate";

/* ── 메인 ── */

async function main() {
  console.log(
    `[fix-image-paths] ${DRY_RUN ? "DRY-RUN" : "EXECUTE"} mode | replacements=${REPLACEMENTS.length}`,
  );

  if (!MONGODB_URI) {
    console.error(
      "[fix-image-paths] MONGODB_URI 환경변수가 설정되지 않았습니다. (.env.local 또는 export 필요)",
    );
    process.exit(1);
  }

  // 연결 대상 echo (실수 방지)
  try {
    const host = new URL(MONGODB_URI).host;
    console.log(
      `[fix-image-paths] target host: ${host} | db=${DB_NAME}`,
    );
  } catch {
    console.log("[fix-image-paths] MONGODB_URI host 파싱 실패 (그대로 진행)");
  }

  try {
    initServerless({ uri: MONGODB_URI, dbName: DB_NAME });
  } catch (err) {
    console.error("[fix-image-paths] initServerless 실패:", err);
    process.exit(2);
  }

  let totalMatched = 0;
  let totalUpdated = 0;
  let totalZeroMatch = 0;

  try {
    const col = await charactersCol();

    for (const { from, to } of REPLACEMENTS) {
      // 어느 필드에서든 from 과 일치하는 row 검색 (5 필드 OR)
      const orFilter = TARGET_FIELDS.map((field) => ({ [field]: from }));
      const filter = { $or: orFilter };

      // dry-run: 매칭만 출력. 어느 필드/어느 codename 이 영향받는지 명시.
      const matched = await col
        .find(filter, {
          projection: {
            codename: 1,
            previewImage: 1,
            pixelCharacterImage: 1,
            "lore.mainImage": 1,
            "lore.posterImage": 1,
            "sheet.mainImage": 1,
          },
        })
        .toArray();

      if (matched.length === 0) {
        totalZeroMatch++;
        if (EXPECTED_NONZERO.has(from)) {
          // 운영 DB 에 적재되어 있다고 사전 확인된 경로 — 0건이면 비정상.
          console.error(
            `[ERROR] expected non-zero but got 0: ${from}\n  → 운영 DB 에 이미 적재된 슬러그(운연/유회)인데 매칭이 0건입니다. DB 상태를 확인하세요.`,
          );
        } else {
          // 미적재 NPC 등 — 0건이 정상.
          console.warn(
            `[INFO] zero-match (예상 범위 — 아직 DB 미적재): ${from}`,
          );
        }
        continue;
      }

      const tag = DRY_RUN ? "[DRY-RUN]" : "[EXECUTE]";
      console.log(`${tag} ${from} → ${to}`);
      console.log(`  matched ${matched.length} row(s):`);
      for (const doc of matched) {
        const hits = TARGET_FIELDS.filter((field) => {
          if (field.includes(".")) {
            const [a, b] = field.split(".");
            return doc[a]?.[b] === from;
          }
          return doc[field] === from;
        });
        for (const field of hits) {
          console.log(
            `    - codename=${doc.codename ?? "(no codename)"}  field=${field}`,
          );
          totalMatched++;
        }
      }

      if (DRY_RUN) continue;

      // EXECUTE: 각 필드별로 별도 updateMany 발행. 한 필드의 동일 값만 갱신.
      for (const field of TARGET_FIELDS) {
        const res = await col.updateMany(
          { [field]: from },
          { $set: { [field]: to, updatedAt: new Date() } },
        );
        if (res.modifiedCount > 0) {
          console.log(
            `  updated ${res.modifiedCount} row(s) on field=${field}`,
          );
          totalUpdated += res.modifiedCount;
        }
      }
    }
  } catch (err) {
    console.error("[fix-image-paths] 처리 중 에러:", err);
    await closeServerless();
    process.exit(1);
  }

  console.log(
    `\n[SUMMARY] total matched=${totalMatched}, total updated=${totalUpdated} (dry-run=${DRY_RUN ? "yes" : "no"}, zero-match replacements=${totalZeroMatch})`,
  );

  await closeServerless();
}

/**
 * shared-db 의 close()는 long-running 모드만 처리하므로
 * cli 프로세스 종료를 위해 globalThis 캐시의 client 를 직접 close.
 * (seed-factions.ts 의 closeServerless 헬퍼와 동일 의도)
 */
async function closeServerless() {
  try {
    const client = await getClient();
    await client.close();
  } catch {
    // init 실패 등으로 client 가 없으면 무시
  }
}

main().catch((err) => {
  console.error("[fix-image-paths] fatal:", err);
  process.exit(1);
});
