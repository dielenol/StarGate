/**
 * 캐릭터 JSON → MongoDB 마이그레이션 스크립트
 *
 * 사용법: npx tsx scripts/migrate-characters.ts
 *
 * 환경변수: MONGODB_URI, DB_NAME (기본값: stargate)
 */

import { MongoClient } from "mongodb";
import { readFileSync } from "fs";
import { resolve } from "path";

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME ?? "stargate";

if (!MONGODB_URI) {
  console.error("MONGODB_URI 환경변수가 필요합니다.");
  process.exit(1);
}

interface JsonAgent {
  id: string;
  codename: string;
  role: string;
  previewImage: string;
  pixelCharacterImage: string;
  warningVideo?: string;
  sheet: Record<string, unknown>;
}

interface JsonNpc {
  id: string;
  codename: string;
  role: string;
  previewImage: string;
  sheet: Record<string, unknown>;
}

async function main() {
  const client = new MongoClient(MONGODB_URI!);

  try {
    await client.connect();
    console.log("MongoDB 연결 성공");

    const db = client.db(DB_NAME);
    const col = db.collection("characters");

    // 인덱스 생성
    await col.createIndex({ codename: 1 }, { unique: true });
    await col.createIndex({ type: 1, isPublic: 1 });
    await col.createIndex({ ownerId: 1 });
    console.log("인덱스 생성 완료");

    // JSON 파일 읽기
    const agentsPath = resolve(
      __dirname,
      "../app/(public)/world/player/data/agents.json",
    );
    const npcsPath = resolve(
      __dirname,
      "../app/(public)/world/player/data/npcs.json",
    );

    const agents: JsonAgent[] = JSON.parse(readFileSync(agentsPath, "utf-8"));
    const npcs: JsonNpc[] = JSON.parse(readFileSync(npcsPath, "utf-8"));

    const now = new Date();

    // 에이전트 마이그레이션
    for (const agent of agents) {
      const doc = {
        codename: agent.codename,
        type: "AGENT" as const,
        role: agent.role,
        previewImage: agent.previewImage,
        pixelCharacterImage: agent.pixelCharacterImage,
        warningVideo: agent.warningVideo ?? undefined,
        sheet: agent.sheet,
        ownerId: null,
        isPublic: true,
        createdAt: now,
        updatedAt: now,
      };

      const result = await col.updateOne(
        { codename: agent.codename },
        { $set: doc },
        { upsert: true },
      );

      const action = result.upsertedCount > 0 ? "생성" : "업데이트";
      console.log(`  AGENT ${agent.codename}: ${action}`);
    }

    // NPC 마이그레이션
    for (const npc of npcs) {
      const doc = {
        codename: npc.codename,
        type: "NPC" as const,
        role: npc.role,
        previewImage: npc.previewImage,
        sheet: npc.sheet,
        ownerId: null,
        isPublic: true,
        createdAt: now,
        updatedAt: now,
      };

      const result = await col.updateOne(
        { codename: npc.codename },
        { $set: doc },
        { upsert: true },
      );

      const action = result.upsertedCount > 0 ? "생성" : "업데이트";
      console.log(`  NPC ${npc.codename}: ${action}`);
    }

    console.log(
      `\n마이그레이션 완료: AGENT ${agents.length}건, NPC ${npcs.length}건`,
    );
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error("마이그레이션 실패:", err);
  process.exit(1);
});
