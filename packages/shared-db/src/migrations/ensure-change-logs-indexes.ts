import type { Db } from "mongodb";

/**
 * character_change_logs 컬렉션 인덱스 보장.
 *
 * - `{ characterId: 1, createdAt: -1 }` — 특정 캐릭터의 변경 타임라인 조회
 * - `{ actorId: 1, createdAt: -1 }` — 쿨다운/actor별 이력 조회
 * - `{ revertedAt: 1 }` — revert 상태 필터 (sparse: 대부분 null 이므로 index size 절감)
 *
 * 호출처: `ensureAllIndexes()` 가 내부적으로 호출. 독립 실행도 가능 (스크립트 등).
 */
export async function ensureChangeLogsIndexes(db: Db): Promise<void> {
  const col = db.collection("character_change_logs");
  await Promise.all([
    col.createIndex(
      { characterId: 1, createdAt: -1 },
      {
        name: "character_change_logs_characterId_createdAt",
        background: true,
      },
    ),
    col.createIndex(
      { actorId: 1, createdAt: -1 },
      {
        name: "character_change_logs_actorId_createdAt",
        background: true,
      },
    ),
    col.createIndex(
      { revertedAt: 1 },
      {
        name: "character_change_logs_revertedAt",
        background: true,
        sparse: true,
      },
    ),
  ]);
}
