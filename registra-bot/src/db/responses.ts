/**
 * 응답 CRUD — shared-db로 이전됨 (shim)
 *
 * @deprecated shared-db에서 직접 import하세요.
 */

export type { UserParticipationRow } from "@stargate/shared-db";

export {
  upsertResponse,
  findBySessionId,
  countByStatus,
  findUserParticipationsInGuild,
} from "@stargate/shared-db";
