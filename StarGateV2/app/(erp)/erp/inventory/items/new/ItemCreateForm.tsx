"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { ItemCategory } from "@/types/inventory";

import { useCreateItem } from "@/hooks/mutations/useInventoryMutation";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import Input from "@/components/ui/Input/Input";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";
import Select from "@/components/ui/Select/Select";

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

  function handleSubmit(e: React.FormEvent) {
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
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <Box className={styles.form__box}>
        <PanelTitle>ITEM DETAILS</PanelTitle>
        <div className={styles.grid}>
          <Field id="item-name" label="이름">
            <Input
              id="item-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="아이템 이름"
              required
            />
          </Field>

          <Field id="item-category" label="카테고리">
            <Select
              id="item-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as ItemCategory)}
            >
              {ITEM_CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field id="item-price" label="가격">
            <Input
              id="item-price"
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0"
              min="0"
            />
          </Field>

          <Field id="item-damage" label="데미지 (선택)">
            <Input
              id="item-damage"
              type="text"
              value={damage}
              onChange={(e) => setDamage(e.target.value)}
              placeholder="예: 1d8+2"
            />
          </Field>

          <Field id="item-effect" label="효과 (선택)" full>
            <Input
              id="item-effect"
              type="text"
              value={effect}
              onChange={(e) => setEffect(e.target.value)}
              placeholder="아이템 효과 설명"
            />
          </Field>

          <Field id="item-desc" label="설명" full>
            <textarea
              id="item-desc"
              className={styles.textarea}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="아이템 설명"
            />
          </Field>

          <div className={`${styles.field} ${styles["field--full"]}`}>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                className={styles.checkbox__input}
                checked={isAvailable}
                onChange={(e) => setIsAvailable(e.target.checked)}
              />
              <span>구매 가능 (Available)</span>
            </label>
          </div>
        </div>
      </Box>

      {error ? <div className={styles.error}>{error}</div> : null}

      <div className={styles.actions}>
        <Button type="submit" variant="primary" disabled={createItem.isPending}>
          {createItem.isPending ? "생성 중..." : "아이템 생성"}
        </Button>
        <Button as="a" href="/erp/inventory">
          취소
        </Button>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  children,
  full = false,
}: {
  id?: string;
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div
      className={[styles.field, full ? styles["field--full"] : ""]
        .filter(Boolean)
        .join(" ")}
    >
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      {children}
    </div>
  );
}
