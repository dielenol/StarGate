"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import type { ItemCategory } from "@/types/inventory";

import { useCreateItem } from "@/hooks/mutations/useInventoryMutation";

import styles from "./page.module.css";

const ITEM_CATEGORIES: { value: ItemCategory; label: string }[] = [
  { value: "WEAPON", label: "무기" },
  { value: "ARMOR", label: "방어구" },
  { value: "CONSUMABLE", label: "소모품" },
  { value: "MATERIAL", label: "재료" },
  { value: "SPECIAL", label: "특수" },
];

export default function ItemCreateForm() {
  const router = useRouter();
  const createItem = useCreateItem();

  const [name, setName] = useState("");
  const [category, setCategory] = useState<ItemCategory>("WEAPON");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [damage, setDamage] = useState("");
  const [effect, setEffect] = useState("");
  const [isAvailable, setIsAvailable] = useState(true);
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("아이템 이름은 필수입니다.");
      return;
    }

    createItem.mutate(
      {
        name: name.trim(),
        category,
        description,
        price: price ? Number(price) : 0,
        damage: damage || undefined,
        effect: effect || undefined,
        isAvailable,
      },
      {
        onSuccess: () => {
          router.push("/erp/inventory");
        },
        onError: (err) => {
          setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
        },
      },
    );
  };

  return (
    <form className={styles.newItem__form} onSubmit={handleSubmit}>
      <div className={styles.newItem__formHeader}>ITEM DETAILS</div>

      <div className={styles.newItem__grid}>
        <div className={styles.newItem__field}>
          <label className={styles.newItem__label} htmlFor="item-name">
            이름
          </label>
          <input
            id="item-name"
            type="text"
            className={styles.newItem__input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="아이템 이름"
            required
          />
        </div>

        <div className={styles.newItem__field}>
          <label className={styles.newItem__label} htmlFor="item-category">
            카테고리
          </label>
          <select
            id="item-category"
            className={styles.newItem__select}
            value={category}
            onChange={(e) => setCategory(e.target.value as ItemCategory)}
          >
            {ITEM_CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>

        <div className={`${styles.newItem__field} ${styles["newItem__field--full"]}`}>
          <label className={styles.newItem__label} htmlFor="item-desc">
            설명
          </label>
          <textarea
            id="item-desc"
            className={styles.newItem__textarea}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="아이템 설명"
          />
        </div>

        <div className={styles.newItem__field}>
          <label className={styles.newItem__label} htmlFor="item-price">
            가격
          </label>
          <input
            id="item-price"
            type="number"
            className={styles.newItem__input}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0"
            min="0"
          />
        </div>

        <div className={styles.newItem__field}>
          <label className={styles.newItem__label} htmlFor="item-damage">
            데미지 (선택)
          </label>
          <input
            id="item-damage"
            type="text"
            className={styles.newItem__input}
            value={damage}
            onChange={(e) => setDamage(e.target.value)}
            placeholder="예: 1d8+2"
          />
        </div>

        <div className={`${styles.newItem__field} ${styles["newItem__field--full"]}`}>
          <label className={styles.newItem__label} htmlFor="item-effect">
            효과 (선택)
          </label>
          <input
            id="item-effect"
            type="text"
            className={styles.newItem__input}
            value={effect}
            onChange={(e) => setEffect(e.target.value)}
            placeholder="아이템 효과 설명"
          />
        </div>

        <div className={`${styles.newItem__field} ${styles["newItem__field--full"]}`}>
          <div className={styles.newItem__checkbox}>
            <input
              id="item-available"
              type="checkbox"
              className={styles.newItem__checkboxInput}
              checked={isAvailable}
              onChange={(e) => setIsAvailable(e.target.checked)}
            />
            <label
              htmlFor="item-available"
              className={styles.newItem__checkboxLabel}
            >
              구매 가능 (Available)
            </label>
          </div>
        </div>
      </div>

      {error && <div className={styles.newItem__error}>{error}</div>}

      <div className={styles.newItem__actions}>
        <Link href="/erp/inventory" className={styles.newItem__cancel}>
          취소
        </Link>
        <button
          type="submit"
          className={styles.newItem__submit}
          disabled={createItem.isPending}
        >
          {createItem.isPending ? "생성 중..." : "아이템 생성"}
        </button>
      </div>
    </form>
  );
}
