"use client";

import { useState } from "react";

import type { MasterItem } from "@/types/inventory";

import { useGrantInventory } from "@/hooks/mutations/useInventoryMutation";

import Button from "@/components/ui/Button/Button";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import Input from "@/components/ui/Input/Input";
import Select from "@/components/ui/Select/Select";

import styles from "./InventoryGrantForm.module.css";

interface InventoryGrantFormProps {
  characterId: string;
  availableItems: MasterItem[];
}

export default function InventoryGrantForm({
  characterId,
  availableItems,
}: InventoryGrantFormProps) {
  const grantInventory = useGrantInventory();

  const [selectedItemId, setSelectedItemId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selectedItem = availableItems.find(
    (item) => String(item._id) === selectedItemId,
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!selectedItemId) {
      setError("아이템을 선택하세요.");
      return;
    }

    const numQuantity = Number(quantity);
    if (isNaN(numQuantity) || numQuantity < 1) {
      setError("수량은 1 이상이어야 합니다.");
      return;
    }

    grantInventory.mutate(
      {
        characterId,
        data: {
          itemId: selectedItemId,
          itemName: selectedItem?.name ?? "",
          quantity: numQuantity,
          note,
        },
      },
      {
        onSuccess: () => {
          setSuccess("아이템이 성공적으로 지급되었습니다.");
          setSelectedItemId("");
          setQuantity("1");
          setNote("");
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
            <option key={String(item._id)} value={String(item._id)}>
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
            required
          />
        </label>

        <label className={styles.field}>
          <Eyebrow>메모 (선택)</Eyebrow>
          <Input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="지급 사유"
          />
        </label>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}
      {success ? <div className={styles.success}>{success}</div> : null}

      <div className={styles.actions}>
        <Button
          type="submit"
          variant="primary"
          disabled={grantInventory.isPending}
        >
          {grantInventory.isPending ? "처리 중..." : "지급"}
        </Button>
      </div>
    </form>
  );
}
