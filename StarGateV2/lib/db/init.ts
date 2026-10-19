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

// DB 장애 때 요청이 드라이버 기본값(30초)만큼 매달리지 않도록
// 서버 선택·소켓 연결 대기를 5초로 줄인다. connectTimeoutMS 는 서버리스(poll)
// heartbeat 응답 대기이기도 해서, 응답 없는 서버에 걸린 쿼리도 heartbeat 시간 초과 때 끊긴다.
initServerless({
  uri,
  dbName,
  maxPoolSize: 5,
  serverSelectionTimeoutMS: 5_000,
  connectTimeoutMS: 5_000,
});
