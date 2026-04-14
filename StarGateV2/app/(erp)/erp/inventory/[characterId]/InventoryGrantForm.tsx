"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { MasterItem } from "@/types/inventory";

import styles from "./page.module.css";

interface InventoryGrantFormProps {
  characterId: string;
  availableItems: MasterItem[];
}

export default function InventoryGrantForm({
  characterId,
  availableItems,
}: InventoryGrantFormProps) {
  const router = useRouter();

  const [isOpen, setIsOpen] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  if (!isOpen) {
    return (
      <div className={styles.grantForm__actions}>
        <button
          type="button"
          className={styles.grantForm__toggleButton}
          onClick={() => setIsOpen(true)}
        >
          + 아이템 지급
        </button>
      </div>
    );
  }

  const selectedItem = availableItems.find(
    (item) => String(item._id) === selectedItemId,
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setIsSubmitting(true);

    try {
      if (!selectedItemId) {
        setError("아이템을 선택하세요.");
        return;
      }

      const numQuantity = Number(quantity);
      if (isNaN(numQuantity) || numQuantity < 1) {
        setError("수량은 1 이상이어야 합니다.");
        return;
      }

      const res = await fetch(`/api/erp/inventory/${characterId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: selectedItemId,
          itemName: selectedItem?.name ?? "",
          quantity: numQuantity,
          note,
        }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "아이템 지급에 실패했습니다.");
      }

      setSuccess("아이템이 성공적으로 지급되었습니다.");
      setSelectedItemId("");
      setQuantity("1");
      setNote("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className={styles.grantForm} onSubmit={handleSubmit}>
      <div className={styles.grantForm__header}>GRANT ITEM</div>

      <div className={styles.grantForm__grid}>
        <div className={styles.grantForm__field}>
          <label className={styles.grantForm__label} htmlFor="grant-item">
            아이템
          </label>
          <select
            id="grant-item"
            className={styles.grantForm__select}
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
          </select>
        </div>

        <div className={styles.grantForm__field}>
          <label className={styles.grantForm__label} htmlFor="grant-quantity">
            수량
          </label>
          <input
            id="grant-quantity"
            type="number"
            className={styles.grantForm__input}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            min="1"
            required
          />
        </div>

        <div className={`${styles.grantForm__field} ${styles["grantForm__field--full"]}`}>
          <label className={styles.grantForm__label} htmlFor="grant-note">
            메모 (선택)
          </label>
          <input
            id="grant-note"
            type="text"
            className={styles.grantForm__input}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="지급 사유"
          />
        </div>
      </div>

      {error && <div className={styles.grantForm__error}>{error}</div>}
      {success && <div className={styles.grantForm__success}>{success}</div>}

      <div className={styles.grantForm__actions}>
        <button
          type="button"
          className={styles.grantForm__cancel}
          onClick={() => {
            setIsOpen(false);
            setError("");
            setSuccess("");
          }}
        >
          취소
        </button>
        <button
          type="submit"
          className={styles.grantForm__submit}
          disabled={isSubmitting}
        >
          {isSubmitting ? "처리 중..." : "지급"}
        </button>
      </div>
    </form>
  );
}
