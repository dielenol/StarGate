"use client";

import { useState } from "react";

import type { ItemCategory } from "@/types/inventory";

import {
  useGrantInventory,
  useGrantSharedInventory,
} from "@/hooks/mutations/useInventoryMutation";

import Button from "@/components/ui/Button/Button";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import Input from "@/components/ui/Input/Input";
import Select from "@/components/ui/Select/Select";

import styles from "./InventoryGrantForm.module.css";

const MAX_GRANT_QUANTITY = 999;

export interface InventoryGrantItem {
  id: string;
  name: string;
  category: ItemCategory;
}

interface InventoryGrantFormProps {
  characterId?: string;
  availableItems: InventoryGrantItem[];
  mode?: "character" | "shared";
}

export default function InventoryGrantForm({
  characterId,
  availableItems,
  mode = "character",
}: InventoryGrantFormProps) {
  const grantInventory = useGrantInventory();
  const grantSharedInventory = useGrantSharedInventory();

  const [selectedItemId, setSelectedItemId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selectedItem = availableItems.find(
    (item) => item.id === selectedItemId,
  );
  const isSharedMode = mode === "shared";
  const isPending = isSharedMode
    ? grantSharedInventory.isPending
    : grantInventory.isPending;

  function resetForm() {
    setSelectedItemId("");
    setQuantity("1");
    setNote("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!selectedItemId) {
      setError("아이템을 선택하세요.");
      return;
    }

    const numQuantity = Number(quantity);
    if (
      !Number.isSafeInteger(numQuantity) ||
      numQuantity < 1 ||
      numQuantity > MAX_GRANT_QUANTITY
    ) {
      setError(`수량은 1~${MAX_GRANT_QUANTITY} 사이의 정수여야 합니다.`);
      return;
    }

    const data = {
      itemId: selectedItemId,
      itemName: selectedItem?.name ?? "",
      quantity: numQuantity,
      note,
    };

    if (isSharedMode) {
      grantSharedInventory.mutate(data, {
        onSuccess: () => {
          setSuccess("공용 인벤토리에 아이템을 추가했습니다.");
          resetForm();
        },
        onError: (err) => {
          setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
        },
      });
      return;
    }

    if (!characterId) {
      setError("캐릭터 ID가 없어 지급할 수 없습니다.");
      return;
    }

    grantInventory.mutate(
      {
        characterId,
        data,
      },
      {
        onSuccess: () => {
          setSuccess("아이템이 성공적으로 지급되었습니다.");
          resetForm();
        },
        onError: (err) => {
          setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
        },
      },
    );
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <label className={styles.field}>
        <Eyebrow>아이템</Eyebrow>
        <Select
          value={selectedItemId}
          onChange={(e) => setSelectedItemId(e.target.value)}
          required
        >
          <option value="">-- 아이템 선택 --</option>
          {availableItems.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} ({item.category})
            </option>
          ))}
        </Select>
      </label>

      <div className={styles.row}>
        <label className={styles.field}>
          <Eyebrow>수량</Eyebrow>
          <Input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            min="1"
            max={String(MAX_GRANT_QUANTITY)}
            step="1"
            required
          />
        </label>

        <label className={styles.field}>
          <Eyebrow>메모 (선택)</Eyebrow>
          <Input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={isSharedMode ? "공용 지급 사유" : "지급 사유"}
          />
        </label>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}
      {success ? <div className={styles.success}>{success}</div> : null}

      <div className={styles.actions}>
        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending ? "처리 중..." : isSharedMode ? "공용 지급" : "지급"}
        </Button>
      </div>
    </form>
  );
}
