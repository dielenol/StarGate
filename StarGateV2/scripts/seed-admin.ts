/**
 * 최초 SUPER_ADMIN 계정 시드 스크립트
 *
 * 사용법:
 *   npx tsx scripts/seed-admin.ts <DISCORD_ID>
 *
 * 예시:
 *   npx tsx scripts/seed-admin.ts 123456789012345678
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { MongoClient } from "mongodb";
import { hash } from "bcryptjs";

// .env.local 수동 로드
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
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  // .env.local 없으면 환경변수에서 직접 읽음
}

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME ?? "stargate";

async function main() {
  const discordId = process.argv[2];

  if (!discordId) {
    console.error("사용법: npx tsx scripts/seed-admin.ts <DISCORD_ID>");
    console.error(
      "Discord ID 확인: Discord 설정 > 고급 > 개발자 모드 ON → 본인 프로필 우클릭 > 사용자 ID 복사",
    );
    process.exit(1);
  }

  if (!MONGODB_URI) {
    console.error("MONGODB_URI 환경변수가 설정되지 않았습니다.");
    console.error(".env.local 파일을 확인하세요.");
    process.exit(1);
  }

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const users = db.collection("users");

    // 이미 존재하는지 확인
    const existing = await users.findOne({ discordId });
    if (existing) {
      console.log("이미 등록된 Discord 계정입니다:");
      console.log(`  username: ${existing.username}`);
      console.log(`  role: ${existing.role}`);
      console.log(`  status: ${existing.status}`);
      await client.close();
      return;
    }

    const plainPassword = "admin1234";
    const hashedPassword = await hash(plainPassword, 12);
    const now = new Date();

    const doc = {
      username: "admin",
      hashedPassword,
      displayName: "관리자",
      discordId,
      discordUsername: null,
      discordAvatar: null,
      role: "SUPER_ADMIN",
      status: "ACTIVE",
      characterIds: [],
      lastLoginAt: null,
      passwordChangedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    await users.insertOne(doc);

    console.log("SUPER_ADMIN 계정 생성 완료:");
    console.log(`  username: admin`);
    console.log(`  password: ${plainPassword}`);
    console.log(`  discordId: ${discordId}`);
    console.log("");
    console.log("로그인 후 반드시 비밀번호를 변경하세요.");
  } finally {
    await client.close();
  }
}

main().catch(console.error);
