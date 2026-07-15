/**
 * 병기부 구매 / 연구 프로젝트 mutation hooks.
 *
 * 카탈로그 장비 단건 구매는 크레딧 차감 + 인벤토리 적재를 처리한다.
 * 연구 프로젝트의 시작·기여·단축·완료 적용 API를 호출한다.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  characterKeys,
  personnelKeys,
} from "@/hooks/queries/useCharactersQuery";
import { characterChangeLogsKeys } from "@/hooks/queries/useCharacterChangeLogs";
import {
  type CreditsResponse,
  creditKeys,
} from "@/hooks/queries/useCreditsQuery";
import { inventoryKeys } from "@/hooks/queries/useInventoryQuery";
import { notificationKeys } from "@/hooks/queries/useNotificationsQuery";
import {
  EquipmentShopApiError,
  type EquipmentResearchProjectEntry,
  equipmentShopKeys,
} from "@/hooks/queries/useEquipmentShopQuery";
import type { EquipmentResearchScope as EquipmentResearchScopeValue } from "@/lib/equipment-shop/research";
import type { EquipmentPurchaseBlockCode } from "@/lib/equipment-shop/purchase-eligibility";
import type { EquipmentShopZone } from "@/lib/equipment-shop/catalog";
import {
  TOWASKI_LICENSE_REDEMPTION_LEASE_MS,
  type TowaskiLicenseTestRequest,
  type TowaskiLicenseTestResponse,
} from "@/lib/equipment-shop/license-test";
import type {
  AdminSerializedEquipmentWorkshopRequest,
  EquipmentWorkshopQuoteInput,
  EquipmentWorkshopRequestStatus,
  EquipmentWorkshopRequestInput,
  EquipmentWorkshopRequestResponse,
  SerializedEquipmentWorkshopRequest,
} from "@/lib/equipment-shop/workshop-request";
import type {
  EquipmentWorkshopBlueprintInput,
  SerializedEquipmentWorkshopBlueprint,
} from "@/lib/equipment-shop/workshop-blueprint";
import { createIdempotencyKey } from "@/lib/query/idempotency";

const LICENSE_TEST_RECOVERY_POLL_INTERVAL_MS = 250;
const LICENSE_TEST_RECOVERY_WINDOW_MS =
  TOWASKI_LICENSE_REDEMPTION_LEASE_MS + 5_000;
const LICENSE_TEST_RECOVERY_ATTEMPTS = Math.ceil(
  LICENSE_TEST_RECOVERY_WINDOW_MS / LICENSE_TEST_RECOVERY_POLL_INTERVAL_MS,
);

interface PurchaseEquipmentInput {
  key: string;
  zone: EquipmentShopZone;
  expectedUnitPrice: number;
}

interface RegisterArmorReferralInput {
  key: string;
}

interface RegisterArmorReferralResponse {
  key: string;
  discountPercent: number;
  expiresAt: string;
}

export interface EquipmentShopQuoteResponse {
  key: string;
  name: string;
  simulatePlayerRules: boolean;
  eligibility: {
    eligible: boolean;
    code: EquipmentPurchaseBlockCode | null;
    reason: string;
  };
  balance: number;
  price: number;
  balanceAfter: number;
  source: "live_character" | "gm_sandbox";
  licenseStatus: {
    satisfied: boolean;
    source: string | null;
    matchedKeyword?: string;
    note?: string;
  } | null;
}

interface CheckoutResponse {
  order: {
    items: Array<{
      key: string;
      name: string;
      quantity: number;
      unitPrice: number;
      listPrice: number;
      totalPrice: number;
      discount: {
        type: "towaski-armor-referral";
        percent: number;
        amount: number;
        expiresAt: string;
      } | null;
    }>;
    totalPrice: number;
    totalDiscount: number;
  };
  balance: number;
}

export type EquipmentResearchScope = EquipmentResearchScopeValue;

interface StartResearchInput {
  key: string;
  scope: EquipmentResearchScope;
  targetCharacterId?: string;
}

interface StartResearchResponse {
  project: Omit<EquipmentResearchProjectEntry, "computedStatus">;
  balance: number;
}

interface RushResearchInput {
  projectId: string;
}

interface RushResearchResponse {
  project: Omit<EquipmentResearchProjectEntry, "computedStatus"> | null;
  rush: {
    cost: number;
    hours: number;
    discountApplied: boolean;
  };
  balance: number;
}

interface ContributeResearchInput {
  key: string;
  amount: number;
}

interface ContributeResearchResponse {
  pool: {
    id: string;
    key: string;
    targetCost: number;
    fundedAmount: number;
    status: "funding" | "started" | "cancelled";
    projectId?: string;
    createdAt: string;
    updatedAt: string;
  };
  contribution: {
    id: string;
    projectKey: string;
    contributorCharacterId: string;
    contributorCodename: string;
    amount: number;
    createdAt: string;
  };
  project: Omit<EquipmentResearchProjectEntry, "computedStatus"> | null;
  balance: number;
  chargedAmount: number;
}

interface CompleteResearchInput {
  projectId: string;
}

interface CompleteResearchResponse {
  projectId: string;
  key: string;
  effect: EquipmentResearchProjectEntry["effect"];
  affected: number;
  skipped: Array<{ id: string; reason: string }>;
  targets: Array<{
    id: string;
    codename: string;
    before: number;
    after: number;
  }>;
}

async function throwEquipmentShopError(res: Response): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
  };
  throw new EquipmentShopApiError(
    body.error ?? "병기부 요청에 실패했습니다.",
    res.status,
    (body.code ?? undefined) as EquipmentShopApiError["code"],
  );
}

export function usePurchaseEquipmentShopItem() {
  const queryClient = useQueryClient();

  return useMutation<
    CheckoutResponse,
    EquipmentShopApiError,
    PurchaseEquipmentInput
  >({
    mutationFn: async (input) => {
      const res = await fetch("/api/erp/equipment-shop/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": createIdempotencyKey(
            "equipment-checkout",
            input,
          ),
        },
        body: JSON.stringify({
          items: [
            {
              key: input.key,
              quantity: 1,
              expectedUnitPrice: input.expectedUnitPrice,
            },
          ],
          purchaseZone: input.zone,
        }),
      });
      if (!res.ok) await throwEquipmentShopError(res);
      return res.json();
    },
    onSuccess: async (data) => {
      queryClient.setQueryData<CreditsResponse>(creditKeys.all, (current) =>
        current ? { ...current, balance: data.balance } : current,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: equipmentShopKeys.catalog }),
        queryClient.invalidateQueries({ queryKey: inventoryKeys.all }),
        queryClient.invalidateQueries({ queryKey: creditKeys.all }),
        queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
      ]);
    },
  });
}

export function useRegisterTowaskiArmorReferral() {
  const queryClient = useQueryClient();

  return useMutation<
    RegisterArmorReferralResponse,
    EquipmentShopApiError,
    RegisterArmorReferralInput
  >({
    mutationFn: async (input) => {
      const res = await fetch("/api/erp/equipment-shop/armor-referral", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) await throwEquipmentShopError(res);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: equipmentShopKeys.catalog });
    },
  });
}

export function useEquipmentShopQuote() {
  return useMutation<
    EquipmentShopQuoteResponse,
    EquipmentShopApiError,
    {
      key: string;
      simulatePlayerRules?: boolean;
      basicLicenseOverride?: boolean;
      balanceOverride?: number;
    }
  >({
    mutationFn: async (input) => {
      const res = await fetch("/api/erp/equipment-shop/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) await throwEquipmentShopError(res);
      return res.json();
    },
  });
}

export function useEquipmentWorkshopRequest() {
  const queryClient = useQueryClient();

  return useMutation<
    EquipmentWorkshopRequestResponse,
    EquipmentShopApiError,
    EquipmentWorkshopRequestInput
  >({
    mutationFn: async (input) => {
      const res = await fetch("/api/erp/equipment-shop/workshop-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": createIdempotencyKey(
            "equipment-workshop-request",
            input,
          ),
        },
        body: JSON.stringify(input),
      });
      if (!res.ok) await throwEquipmentShopError(res);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: equipmentShopKeys.workshopRequestsRoot,
      });
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useUpdateEquipmentWorkshopRequest() {
  const queryClient = useQueryClient();

  return useMutation<
    { request: SerializedEquipmentWorkshopRequest },
    EquipmentShopApiError,
    {
      requestId: string;
      status: EquipmentWorkshopRequestStatus;
      operatorNote?: string;
    }
  >({
    mutationFn: async (input) => {
      const res = await fetch("/api/erp/equipment-shop/workshop-request", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) await throwEquipmentShopError(res);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: equipmentShopKeys.workshopRequestsRoot,
      });
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

async function invalidateWorkshopEconomy(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: equipmentShopKeys.workshopRequestsRoot }),
    queryClient.invalidateQueries({ queryKey: equipmentShopKeys.catalog }),
    queryClient.invalidateQueries({ queryKey: inventoryKeys.all }),
    queryClient.invalidateQueries({ queryKey: creditKeys.all }),
    queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  ]);
}

async function invalidateWorkshopRequests(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: equipmentShopKeys.workshopRequestsRoot }),
    queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  ]);
}

function useEquipmentWorkshopAction(action: "accept" | "decline" | "claim") {
  const queryClient = useQueryClient();
  return useMutation<
    { request: SerializedEquipmentWorkshopRequest },
    EquipmentShopApiError,
    { requestId: string; expectedQuoteVersion?: number }
  >({
    mutationFn: async (input) => {
      const { requestId, expectedQuoteVersion } = input;
      const res = await fetch(
        `/api/erp/equipment-shop/workshop-request/${requestId}/${action}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": createIdempotencyKey(`equipment-workshop-${action}`, input),
          },
          body: JSON.stringify({ expectedQuoteVersion }),
        },
      );
      if (!res.ok) await throwEquipmentShopError(res);
      return res.json();
    },
    onSuccess: () => invalidateWorkshopEconomy(queryClient),
  });
}

export function useAcceptEquipmentWorkshopQuote() {
  return useEquipmentWorkshopAction("accept");
}

export function useDeclineEquipmentWorkshopQuote() {
  return useEquipmentWorkshopAction("decline");
}

export function useClaimEquipmentWorkshopResult() {
  return useEquipmentWorkshopAction("claim");
}

export function useQuoteEquipmentWorkshopRequest() {
  const queryClient = useQueryClient();
  return useMutation<
    { request: AdminSerializedEquipmentWorkshopRequest },
    EquipmentShopApiError,
    { requestId: string; quote: EquipmentWorkshopQuoteInput }
  >({
    mutationFn: async ({ requestId, quote }) => {
      const res = await fetch(`/api/erp/admin/equipment-workshop/${requestId}/quote`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(quote),
      });
      if (!res.ok) await throwEquipmentShopError(res);
      return res.json();
    },
    onSuccess: () => invalidateWorkshopRequests(queryClient),
  });
}

export function useCreateEquipmentWorkshopBlueprint() {
  const queryClient = useQueryClient();
  return useMutation<
    { blueprint: SerializedEquipmentWorkshopBlueprint },
    EquipmentShopApiError,
    EquipmentWorkshopBlueprintInput
  >({
    mutationFn: async (blueprint) => {
      const res = await fetch("/api/erp/admin/equipment-workshop/blueprints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(blueprint),
      });
      if (!res.ok) await throwEquipmentShopError(res);
      return res.json();
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: equipmentShopKeys.workshopBlueprintsRoot,
      }),
  });
}

export function useUpdateEquipmentWorkshopBlueprint() {
  const queryClient = useQueryClient();
  return useMutation<
    { blueprint: SerializedEquipmentWorkshopBlueprint },
    EquipmentShopApiError,
    {
      id: string;
      expectedVersion: number;
      blueprint: EquipmentWorkshopBlueprintInput;
    }
  >({
    mutationFn: async (input) => {
      const res = await fetch("/api/erp/admin/equipment-workshop/blueprints", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) await throwEquipmentShopError(res);
      return res.json();
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: equipmentShopKeys.workshopBlueprintsRoot,
      }),
  });
}

export function useArchiveEquipmentWorkshopBlueprint() {
  const queryClient = useQueryClient();
  return useMutation<
    { blueprint: SerializedEquipmentWorkshopBlueprint },
    EquipmentShopApiError,
    { id: string; expectedVersion: number }
  >({
    mutationFn: async (input) => {
      const res = await fetch("/api/erp/admin/equipment-workshop/blueprints", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) await throwEquipmentShopError(res);
      return res.json();
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: equipmentShopKeys.workshopBlueprintsRoot,
      }),
  });
}

export function useCancelEquipmentWorkshopRequest() {
  const queryClient = useQueryClient();
  return useMutation<
    { request: AdminSerializedEquipmentWorkshopRequest },
    EquipmentShopApiError,
    { requestId: string; note: string }
  >({
    mutationFn: async (input) => {
      const { requestId, note } = input;
      const res = await fetch(`/api/erp/admin/equipment-workshop/${requestId}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": createIdempotencyKey("equipment-workshop-cancel", input),
        },
        body: JSON.stringify({ note }),
      });
      if (!res.ok) await throwEquipmentShopError(res);
      return res.json();
    },
    onSuccess: () => invalidateWorkshopEconomy(queryClient),
  });
}

export function useApproveEquipmentWorkshopReload() {
  const queryClient = useQueryClient();
  return useMutation<
    { request: AdminSerializedEquipmentWorkshopRequest },
    EquipmentShopApiError,
    { requestId: string }
  >({
    mutationFn: async (input) => {
      const res = await fetch(
        `/api/erp/admin/equipment-workshop/${input.requestId}/approve-reload`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": createIdempotencyKey(
              "equipment-workshop-reload",
              input,
            ),
          },
          body: JSON.stringify({}),
        },
      );
      if (!res.ok) await throwEquipmentShopError(res);
      return res.json();
    },
    onSuccess: () => invalidateWorkshopEconomy(queryClient),
  });
}

export function useCompleteTowaskiLicenseTest() {
  const queryClient = useQueryClient();

  return useMutation<
    TowaskiLicenseTestResponse,
    EquipmentShopApiError,
    TowaskiLicenseTestRequest
  >({
    mutationFn: async (input) => {
      const requestId = createIdempotencyKey("towaski-license-test", input);
      const res = await fetch("/api/erp/equipment-shop/license-test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": requestId,
        },
        body: JSON.stringify(input),
      });
      if (res.status === 409) {
        for (
          let attempt = 0;
          attempt < LICENSE_TEST_RECOVERY_ATTEMPTS;
          attempt += 1
        ) {
          await new Promise((resolve) =>
            setTimeout(resolve, LICENSE_TEST_RECOVERY_POLL_INTERVAL_MS),
          );
          const statusRes = await fetch(
            `/api/erp/equipment-shop/license-test?requestId=${encodeURIComponent(requestId)}`,
            { cache: "no-store" },
          );
          if (!statusRes.ok) continue;
          const status = (await statusRes.json()) as TowaskiLicenseTestResponse;
          if (status.status !== "processing") return status;
        }
      }
      if (!res.ok) await throwEquipmentShopError(res);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: equipmentShopKeys.catalog });
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useStartEquipmentResearch() {
  const queryClient = useQueryClient();

  return useMutation<
    StartResearchResponse,
    EquipmentShopApiError,
    StartResearchInput
  >({
    mutationFn: async (input) => {
      const res = await fetch("/api/erp/equipment-shop/research/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": createIdempotencyKey("research-start", input),
        },
        body: JSON.stringify(input),
      });
      if (!res.ok) await throwEquipmentShopError(res);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: equipmentShopKeys.research });
      queryClient.invalidateQueries({ queryKey: creditKeys.all });
    },
  });
}

export function useRushEquipmentResearch() {
  const queryClient = useQueryClient();

  return useMutation<
    RushResearchResponse,
    EquipmentShopApiError,
    RushResearchInput
  >({
    mutationFn: async (input) => {
      const res = await fetch("/api/erp/equipment-shop/research/rush", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": createIdempotencyKey("research-rush", input),
        },
        body: JSON.stringify(input),
      });
      if (!res.ok) await throwEquipmentShopError(res);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: equipmentShopKeys.research });
      queryClient.invalidateQueries({ queryKey: creditKeys.all });
    },
  });
}

export function useContributeEquipmentResearch() {
  const queryClient = useQueryClient();

  return useMutation<
    ContributeResearchResponse,
    EquipmentShopApiError,
    ContributeResearchInput
  >({
    mutationFn: async (input) => {
      const res = await fetch("/api/erp/equipment-shop/research/contribute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": createIdempotencyKey(
            "research-contribute",
            input,
          ),
        },
        body: JSON.stringify(input),
      });
      if (!res.ok) await throwEquipmentShopError(res);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: equipmentShopKeys.research });
      queryClient.invalidateQueries({ queryKey: creditKeys.all });
    },
  });
}

export function useCompleteEquipmentResearch() {
  const queryClient = useQueryClient();

  return useMutation<
    CompleteResearchResponse,
    EquipmentShopApiError,
    CompleteResearchInput
  >({
    mutationFn: async (input) => {
      const res = await fetch("/api/erp/equipment-shop/research/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) await throwEquipmentShopError(res);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: equipmentShopKeys.research });
      queryClient.invalidateQueries({ queryKey: characterKeys.all });
      queryClient.invalidateQueries({ queryKey: personnelKeys.all });
      queryClient.invalidateQueries({ queryKey: characterChangeLogsKeys.all });
    },
  });
}
