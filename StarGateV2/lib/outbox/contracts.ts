import type { PlayerTradeOffer } from "@stargate/shared-db/types";

export interface DiscordAuditField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface CharacterEditWebhookPayload {
  character: { id: string; codename: string; name: string };
  actor: { id: string; displayName: string; role: string };
  source: "admin" | "player";
  actorIsOwner: boolean;
  changes: Array<{ field: string; before: unknown; after: unknown }>;
  reason?: string;
  timestamp: Date;
}

export interface EquipmentWorkshopRequestWebhookPayload {
  kind: "upgrade" | "custom" | "reload";
  character: { id: string; codename: string; name: string };
  requester: { id: string; displayName: string };
  details: string;
  equipmentName?: string;
  timestamp: Date;
}

export interface GmAdminAuditWebhookPayload {
  action: string;
  actor: { id: string; displayName: string; role: string };
  summary: string;
  target?: string;
  details?: DiscordAuditField[];
  timestamp: Date;
}

export type WorkflowStatusType =
  | "EQUIPMENT_WORKSHOP"
  | "PLAYER_TRADE"
  | "SHOP_REORDER"
  | "BUREAUCRAT_VOTE"
  | "EQUIPMENT_RESEARCH"
  | "OPERATION_CREDIT";

export interface WorkflowStatusWebhookPayload {
  workflow: WorkflowStatusType;
  workflowId: string;
  stage: string;
  revision?: number;
  actor: {
    kind: "PLAYER" | "GM" | "BOT" | "SYSTEM";
    displayName: string;
  };
  summary: string;
  target?: string;
  delegatedTo?: string[];
  details?: DiscordAuditField[];
  urlPath?: string;
  occurredAt: Date;
  /** 예약 단계(예: 공방 READY)가 실제로 전달될 시각. */
  availableAt?: Date;
}

export type ShopPageGroup = "BASIC" | "RECOVERY" | "LUXURY" | "RARE";

export interface ShopReorderWebhookPayload {
  today: string;
  item: {
    slug: string;
    name: string;
    icon: string;
    price: number;
    pageGroup: ShopPageGroup;
  };
  requester: {
    id: string;
    displayName: string;
  };
  character?: {
    id: string;
    codename: string;
  };
  requestedAt: Date;
}

export interface ShopReorderFulfilledWebhookPayload {
  today: string;
  item: {
    slug: string;
    name: string;
    icon: string;
    price: number;
    pageGroup: ShopPageGroup;
  };
  quantity: number;
  stock: number;
  fulfilledAt: Date;
}

export interface ShopProductLaunchWebhookPayload {
  item: {
    slug: string;
    name: string;
    icon: string;
    price: number;
    pageGroup: ShopPageGroup;
    description: string;
    effect?: string;
    previewImage?: string;
  };
  launchedAt: Date;
}

export interface MrBeastLotteryWinnerWebhookPayload {
  claimId: string;
  eventId: string;
  /** 과거 outbox에는 없으므로 worker는 미지정 시 기존 복권 이름으로 폴백한다. */
  lotteryName?: string;
  character: {
    id: string;
    codename: string;
  };
  tier: "second" | "first" | "zeroth";
  label: string;
  reward: number;
  revealedAt: Date;
}

export type PlayerTradeDiscordDmEvent =
  | "EXCHANGE_OPENED"
  | "GIFT_RECEIVED"
  | "EXCHANGE_COMPLETED"
  | "EXCHANGE_CANCELLED";

export interface PlayerTradeDiscordDmInput {
  tradeId: string;
  event: PlayerTradeDiscordDmEvent;
  userId: string;
  recipientCodename: string;
  otherCharacterCodename: string;
  offer?: PlayerTradeOffer;
}

export interface StockManualInterventionNotice {
  eventKind?:
    | "PRICE"
    | "HALT"
    | "RESUME"
    | "SHOCK_DISCLOSURE"
    | "COOLDOWN"
    | "COOLDOWN_RELEASE";
  ticker: string;
  previousPrice: number;
  price: number;
  eventText: string;
  actor: {
    displayName: string;
    role: string;
  };
  occurredAt?: Date;
}
