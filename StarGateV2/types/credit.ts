/**
 * @deprecated shared-db에서 직접 import하세요.
 */

export type {
  CreditTransaction,
  CreditTransactionType,
  CreateCreditTransactionInput,
  WebAllowedCreditType,
  GmDirectGrantType,
  BotOnlyCreditType,
} from "@stargate/shared-db/types";

export {
  CREDIT_TRANSACTION_TYPES,
  WEB_ALLOWED_CREDIT_TYPES,
  GM_DIRECT_GRANT_TYPES,
  BOT_ONLY_CREDIT_TYPES,
  isGmDirectGrantType,
} from "@stargate/shared-db/types";
