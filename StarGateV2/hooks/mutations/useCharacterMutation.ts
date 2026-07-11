import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { CreateCharacterInput, LoreSheet, PlaySheet } from "@/types/character";

import {
  characterKeys,
  personnelKeys,
} from "@/hooks/queries/useCharactersQuery";
import { equipmentShopKeys } from "@/hooks/queries/useEquipmentShopQuery";

/**
 * 캐릭터 생성 — POST /api/erp/characters.
 * 성공 시 AGENT 카탈로그 + personnel 카탈로그 모두 invalidate.
 */
export function useCreateCharacter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateCharacterInput) => {
      const res = await fetch("/api/erp/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "캐릭터 생성에 실패했습니다.");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: characterKeys.all });
      queryClient.invalidateQueries({ queryKey: personnelKeys.all });
      queryClient.invalidateQueries({ queryKey: equipmentShopKeys.catalog });
    },
  });
}

interface SubDocPatchVars<T> {
  id: string;
  patch: Partial<T>;
  /** 변경 사유 — audit/webhook 으로만 흐름. update payload 에 포함되지 않음. */
  reason?: string;
}

/**
 * play sub-document 부분 패치.
 * AGENT 만 적용 (NPC 는 서버 화이트리스트가 차단). admin 만 호출 가능.
 *
 * invalidate: AGENT 카탈로그 / 해당 캐릭터 detail. personnel 은 lore 가 안 바뀌므로 미invalidate.
 */
export function useUpdatePlayMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, patch, reason }: SubDocPatchVars<PlaySheet>) => {
      const body: Record<string, unknown> = { play: patch };
      if (reason) body.reason = reason;
      const res = await fetch(`/api/erp/characters/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "play 수정에 실패했습니다.");
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: characterKeys.agent.all });
      queryClient.invalidateQueries({
        queryKey: characterKeys.agent.byId(vars.id),
      });
      queryClient.invalidateQueries({ queryKey: equipmentShopKeys.catalog });
    },
  });
}

/**
 * lore sub-document 부분 패치.
 * AGENT/NPC 양쪽 모두 적용. lore 는 personnel + character 양쪽에 영향이므로 두 캐시 모두 invalidate.
 */
export function useUpdateLoreMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, patch, reason }: SubDocPatchVars<LoreSheet>) => {
      const body: Record<string, unknown> = { lore: patch };
      if (reason) body.reason = reason;
      const res = await fetch(`/api/erp/characters/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "lore 수정에 실패했습니다.");
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      // lore 는 양쪽 화면에 영향. AGENT 카탈로그 + personnel + 개별 detail/dossier 모두 invalidate.
      queryClient.invalidateQueries({ queryKey: characterKeys.agent.all });
      queryClient.invalidateQueries({
        queryKey: characterKeys.agent.byId(vars.id),
      });
      queryClient.invalidateQueries({ queryKey: personnelKeys.all });
      queryClient.invalidateQueries({ queryKey: personnelKeys.byId(vars.id) });
      queryClient.invalidateQueries({ queryKey: equipmentShopKeys.catalog });
    },
  });
}
