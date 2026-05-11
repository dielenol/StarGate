/**
 * shared-db 서버리스 초기화 (사이드이펙트)
 *
 * trpg-web 의 모든 server-side 코드는 본 모듈을 import 하여
 * MongoDB 커넥션 풀의 단일 초기화를 보장한다.
 */

import { initServerless } from "@stargate/shared-db";

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error("MONGODB_URI 환경변수가 설정되지 않았습니다.");
}

initServerless({
  uri,
  dbName: "stargate",
  maxPoolSize: 5,
});
