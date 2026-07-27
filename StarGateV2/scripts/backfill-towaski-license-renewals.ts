/**
 * 토와스키 고급 라이센스 v1 갱신 유예 백필.
 *
 * 기본 동작은 읽기 전용 dry-run이다.
 * 실제 반영은 아래 두 조건을 모두 만족해야 한다.
 *
 *   pnpm migrate:towaski-license-renewals -- --apply --expected-count <N>
 *
 * - --apply: 쓰기 의사 명시
 * - --expected-count: 실행 직전 재조회한 대상 수와 정확히 일치
 *
 * 라이브 실행은 별도의 운영 승인 후에만 수행한다.
 */

import { MongoClient, type ObjectId } from "mongodb";

const ADVANCED_LICENSE_SLUGS = [
  "towaski-license-heavy-weapon",
  "towaski-license-flame-weapon",
  "towaski-license-sonic-equipment",
  "towaski-license-explosive-ordnance",
] as const;

interface MasterItemRow {
  _id: ObjectId;
  slug?: string;
  name: string;
}

interface InventoryRow {
  _id: ObjectId;
  characterId: string;
  characterCodename: string;
  itemId: string;
  itemName: string;
  quantity: number;
  acquiredAt: Date;
}

function readExpectedCount(argv: readonly string[]): number | null {
  const inline = argv.find((arg) => arg.startsWith("--expected-count="));
  const raw = inline?.slice("--expected-count=".length) ??
    (() => {
      const index = argv.indexOf("--expected-count");
      return index >= 0 ? argv[index + 1] : undefined;
    })();

  if (raw === undefined) return null;

  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error("--expected-count에는 0 이상의 정수를 입력해야 합니다.");
  }
  return parsed;
}

function unversionedQualificationFilter() {
  return {
    $or: [
      { licenseQualification: { $exists: false } },
      { licenseQualification: null },
    ],
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply");
  const expectedCount = readExpectedCount(argv);
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.DB_NAME?.trim() || "stargate";

  if (!uri) {
    throw new Error("MONGODB_URI 환경변수가 필요합니다.");
  }
  if (apply && expectedCount === null) {
    throw new Error(
      "쓰기에는 --apply와 --expected-count <실행 직전 대상 수>가 모두 필요합니다.",
    );
  }

  const client = new MongoClient(uri, { maxPoolSize: 2 });

  try {
    await client.connect();
    const db = client.db(dbName);
    const masterItems = db.collection<MasterItemRow>("master_items");
    const inventory = db.collection<InventoryRow>("character_inventory");
    const licenseItems = await masterItems
      .find({ slug: { $in: [...ADVANCED_LICENSE_SLUGS] } })
      .project<MasterItemRow>({ _id: 1, slug: 1, name: 1 })
      .toArray();

    const foundSlugs = new Set(licenseItems.map((item) => item.slug));
    const missingSlugs = ADVANCED_LICENSE_SLUGS.filter(
      (slug) => !foundSlugs.has(slug),
    );
    if (missingSlugs.length > 0) {
      throw new Error(
        `고급 라이센스 마스터 아이템을 찾지 못했습니다: ${missingSlugs.join(", ")}`,
      );
    }

    const itemIds = licenseItems.map((item) => item._id.toHexString());
    const candidateFilter = {
      itemId: { $in: itemIds },
      quantity: { $gt: 0 },
      ...unversionedQualificationFilter(),
    };
    const candidates = await inventory
      .find(candidateFilter)
      .sort({ itemName: 1, characterCodename: 1, _id: 1 })
      .toArray();

    console.log(
      `[towaski-license-renewal] ${apply ? "APPLY 요청" : "DRY-RUN"} / 대상 ${candidates.length}건`,
    );
    console.table(
      candidates.map((entry) => ({
        inventoryId: entry._id.toHexString(),
        character: entry.characterCodename,
        license: entry.itemName,
        acquiredAt: entry.acquiredAt.toISOString(),
      })),
    );

    if (!apply) {
      console.log(
        "변경하지 않았습니다. 승인 후 --apply --expected-count <대상 수>를 함께 지정해야 반영됩니다.",
      );
      return;
    }

    if (candidates.length !== expectedCount) {
      throw new Error(
        `예상 대상 수(${expectedCount})와 실행 직전 대상 수(${candidates.length})가 달라 중단했습니다.`,
      );
    }

    const qualifiedAtFallback = new Date();
    const renewalDueAt = new Date(qualifiedAtFallback.getTime() + 30 * 86_400_000);
    const session = client.startSession();

    try {
      await session.withTransaction(async () => {
        const refreshed = await inventory
          .find(candidateFilter, { session })
          .sort({ _id: 1 })
          .toArray();
        if (refreshed.length !== expectedCount) {
          throw new Error(
            `트랜잭션 내 대상 수(${refreshed.length})가 예상 수(${expectedCount})와 달라 중단했습니다.`,
          );
        }

        const result = await inventory.bulkWrite(
          refreshed.map((entry) => ({
            updateOne: {
              filter: {
                _id: entry._id,
                quantity: { $gt: 0 },
                ...unversionedQualificationFilter(),
              },
              update: {
                $set: {
                  licenseQualification: {
                    authority: "TOWASKI" as const,
                    programVersion: 1,
                    qualifiedAt: entry.acquiredAt ?? qualifiedAtFallback,
                    renewalDueAt,
                  },
                },
              },
            },
          })),
          { session },
        );

        if (result.modifiedCount !== expectedCount) {
          throw new Error(
            `수정 수(${result.modifiedCount})가 예상 수(${expectedCount})와 달라 롤백합니다.`,
          );
        }
      });
    } finally {
      await session.endSession();
    }

    const remaining = await inventory.countDocuments(candidateFilter);
    if (remaining !== 0) {
      throw new Error(
        `반영 후 무버전 대상 ${remaining}건이 남았습니다. 추가 쓰기 없이 종료합니다.`,
      );
    }

    console.log(
      `[towaski-license-renewal] ${expectedCount}건 반영 완료 / 갱신 기한 ${renewalDueAt.toISOString()}`,
    );
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(
    "[towaski-license-renewal] 실패:",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
