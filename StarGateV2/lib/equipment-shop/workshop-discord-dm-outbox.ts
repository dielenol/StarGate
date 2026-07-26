import type {
  EquipmentWorkshopRequestStatus,
  EquipmentWorkshopSpecialistStep,
} from "@/lib/equipment-shop/workshop-request";

export type EquipmentWorkshopDiscordDmEvent =
  | "REQUESTED"
  | "IN_REVIEW"
  | "QUOTED"
  | "IN_PROGRESS"
  | "READY"
  | "DECLINED"
  | "REJECTED"
  | "CANCELLED"
  | "COMPLETED";

export interface EquipmentWorkshopDiscordDmPayload {
  equipmentName?: string;
  quoteVersion?: number;
  totalCost?: number;
  durationMinutes?: number;
  readyAt?: Date;
  specialistWorkflow?: EquipmentWorkshopSpecialistStep[];
  note?: string;
}

export interface EquipmentWorkshopDiscordDmOutboxEvent {
  id: string;
  event: EquipmentWorkshopDiscordDmEvent;
  createdAt: Date;
  availableAt: Date;
  payload?: EquipmentWorkshopDiscordDmPayload;
  sentAt?: Date;
  skippedAt?: Date;
  skippedReason?:
    | "skipped_unlinked"
    | "skipped_inactive"
    | "skipped_unreachable"
    | "no_longer_ready";
}

export function createEquipmentWorkshopDiscordDmOutboxEvent(input: {
  event: EquipmentWorkshopDiscordDmEvent;
  createdAt: Date;
  availableAt?: Date;
  payload?: EquipmentWorkshopDiscordDmPayload;
}): EquipmentWorkshopDiscordDmOutboxEvent {
  const suffix =
    input.payload?.quoteVersion !== undefined
      ? `:${input.payload.quoteVersion}`
      : "";
  return {
    id: `${input.event}${suffix}`,
    event: input.event,
    createdAt: input.createdAt,
    availableAt: input.availableAt ?? input.createdAt,
    ...(input.payload ? { payload: input.payload } : {}),
  };
}

export function createEquipmentWorkshopStatusDmOutboxEvents(input: {
  status: EquipmentWorkshopRequestStatus;
  at: Date;
  quoteVersion?: number;
  readyAt?: Date;
  note?: string;
}): EquipmentWorkshopDiscordDmOutboxEvent[] {
  if (input.status === "APPROVED") return [];

  const payload: EquipmentWorkshopDiscordDmPayload = {
    ...(input.quoteVersion !== undefined
      ? { quoteVersion: input.quoteVersion }
      : {}),
    ...(input.readyAt ? { readyAt: input.readyAt } : {}),
    ...(input.note ? { note: input.note } : {}),
  };
  const event = createEquipmentWorkshopDiscordDmOutboxEvent({
    event: input.status,
    createdAt: input.at,
    ...(Object.keys(payload).length > 0 ? { payload } : {}),
  });
  if (input.status !== "IN_PROGRESS" || !input.readyAt) return [event];

  return [
    event,
    createEquipmentWorkshopDiscordDmOutboxEvent({
      event: "READY",
      createdAt: input.at,
      availableAt: input.readyAt,
      payload: { readyAt: input.readyAt },
    }),
  ];
}
