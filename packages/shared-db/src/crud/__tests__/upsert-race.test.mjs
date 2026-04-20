/**
 * upsertFactionByCode / upsertInstitutionByCode 의 동시성 검증.
 *
 * 전제: `ensureAllIndexes()` 로 unique 인덱스가 걸려 있을 때
 *        동시 호출 10회 중 1개만 insert 성공, 나머지는 E11000 rejected 되어야 한다.
 *
 * MONGODB_URI 가 없으면 skip (로컬 테스트만 대상).
 * DB_NAME 은 의도치 않은 오염 방지를 위해 "stargate_test_upsert_race" 고정.
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ensureAllIndexes,
  factionsCol,
  getClient,
  initServerless,
  upsertFactionByCode,
} from "../../../dist/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// StarGateV2/.env.local 을 참조 (MONGODB_URI 획득).
const ENV_PATH = resolve(
  __dirname,
  "../../../../../StarGateV2/.env.local",
);

function loadEnv() {
  try {
    const content = readFileSync(ENV_PATH, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx);
      const val = trimmed.slice(eqIdx + 1);
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // .env.local 부재 — 테스트 skip.
  }
}

loadEnv();

const HAS_DB = typeof process.env.MONGODB_URI === "string" && process.env.MONGODB_URI.length > 0;
const TEST_DB_NAME = "stargate_test_upsert_race";
const TEST_CODE = "TEST_RACE_CONCURRENT_ISO";
const TEST_SLUG = "test-race-concurrent-iso";

test(
  "RACE: upsertFactionByCode 동시 10회 — unique 인덱스 존재 시 E11000으로 거절",
  { skip: !HAS_DB && "MONGODB_URI 없음 (로컬 전용 테스트)" },
  async () => {
    initServerless({
      uri: process.env.MONGODB_URI,
      dbName: TEST_DB_NAME,
    });

    try {
      const col = await factionsCol();

      // 사전 cleanup
      await col.deleteMany({ code: TEST_CODE });
      await col.deleteMany({ slug: TEST_SLUG });

      // 인덱스 보장 (최초 실행 시 unique 인덱스 부재 상태 방지)
      await ensureAllIndexes();

      const payload = {
        code: TEST_CODE,
        slug: TEST_SLUG,
        label: "테스트",
        labelEn: "Test Race",
        summary: "동시성 재현용 임시 세력",
        isPublic: false,
        source: "manual",
        tags: [],
      };

      const promises = Array.from({ length: 10 }, () =>
        upsertFactionByCode(payload),
      );
      const results = await Promise.allSettled(promises);

      let fulfilled = 0;
      let rejected = 0;
      let inserted = 0;
      let e11000 = 0;
      for (const r of results) {
        if (r.status === "fulfilled") {
          fulfilled++;
          if (r.value.inserted) inserted++;
        } else {
          rejected++;
          if (r.reason && r.reason.code === 11000) e11000++;
        }
      }

      // 동시성 race 로 실제 insert 성공한 호출 수 (1 이상) + E11000 개수 = 10
      assert.equal(
        fulfilled + rejected,
        10,
        "총 호출 10회가 모두 처리되어야 함",
      );
      assert.ok(inserted >= 1, "최소 1개 insert 성공");
      assert.ok(
        e11000 + (fulfilled - inserted) === rejected + (fulfilled - inserted),
        "rejected는 모두 E11000이어야 (unique index 작동 증명)",
      );
      // 핵심 assertion: DB에는 정확히 1개만 존재해야 함
      const actualCount = await col.countDocuments({ code: TEST_CODE });
      assert.equal(
        actualCount,
        1,
        `race 후 DB 문서 수는 1개여야 하는데 ${actualCount}개 존재 (unique 인덱스 부재 의심)`,
      );

      // cleanup
      await col.deleteMany({ code: TEST_CODE });
      await col.deleteMany({ slug: TEST_SLUG });
    } finally {
      const client = await getClient().catch(() => null);
      if (client) await client.close().catch(() => {});
    }
  },
);
