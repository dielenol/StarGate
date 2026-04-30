/**
 * @deprecated shared-db의 isValidObjectId를 직접 사용하세요.
 *
 * 단, lib/db/utils 만 import 하고 shared-db CRUD 를 직접 import 하는 라우트가 있으므로
 * (예: app/api/erp/characters/[id]/change-logs/[logId]/route.ts DELETE) 본 모듈도
 * `./init` 사이드이펙트를 함께 트리거해 cold-start 첫 요청에서 `getDb()` 가 throw 되지
 * 않도록 봉인한다.
 */

import "./init";

export { isValidObjectId } from "@stargate/shared-db";
