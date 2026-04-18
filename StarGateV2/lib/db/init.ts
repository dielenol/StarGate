/**
 * shared-db 서버리스 초기화 (사이드이펙트)
 *
 * Next.js 환경변수에서 MongoDB URI를 읽어 shared-db의 서버리스 모드를 초기화합니다.
 * 이 파일은 lib/db 레이어에서 최초 import 시점에 실행됩니다.
 */

import { initServerless } from "@stargate/shared-db";

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error("MONGODB_URI 환경변수가 설정되지 않았습니다.");
}

const dbName = process.env.DB_NAME ?? "stargate";

initServerless({ uri, dbName, maxPoolSize: 5 });
