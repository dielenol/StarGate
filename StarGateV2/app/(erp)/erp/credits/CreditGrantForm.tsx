"use client";

import { useState } from "react";

import type { CreditTransactionType } from "@/types/credit";
import type { UserPublic } from "@/types/user";

import { useGrantCredit } from "@/hooks/mutations/useCreditMutation";

import styles from "./CreditGrantForm.module.css";

interface CreditGrantFormProps {
  users: UserPublic[];
}

const GRANT_TYPES: { value: CreditTransactionType; label: string }[] = [
  { value: "ADMIN_GRANT", label: "관리자 지급" },
  { value: "ADMIN_DEDUCT", label: "관리자 차감" },
  { value: "SESSION_REWARD", label: "세션 보상" },
];

export default function CreditGrantForm({ users }: CreditGrantFormProps) {
  const grantCredit = useGrantCredit();

  const [isOpen, setIsOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<CreditTransactionType>("ADMIN_GRANT");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  if (!isOpen) {
    return (
      <div className={styles.form__actions}>
        <button
          type="button"
          className={styles.form__submit}
          onClick={() => setIsOpen(true)}
        >
          + 크레딧 지급
        </button>
      </div>
    );
  }

  const selectedUser = users.find((u) => u._id === userId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount === 0) {
      setError("유효한 금액을 입력하세요.");
      return;
    }

    const finalAmount =
      type === "ADMIN_DEDUCT" ? -Math.abs(numAmount) : Math.abs(numAmount);

    grantCredit.mutate(
      {
        userId,
        userName: selectedUser?.displayName ?? "",
        amount: finalAmount,
        type,
        description,
      },
      {
        onSuccess: () => {
          setSuccess("크레딧이 성공적으로 처리되었습니다.");
          setUserId("");
          setAmount("");
          setDescription("");
        },
        onError: (err) => {
          setError(err.message);
        },
      },
    );
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.form__header}>CREDIT GRANT</div>

      <div className={styles.form__grid}>
        <div className={styles.form__field}>
          <label className={styles.form__label} htmlFor="credit-user">
            대상 유저
          </label>
          <select
            id="credit-user"
            className={styles.form__select}
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            required
          >
            <option value="">-- 유저 선택 --</option>
            {users.map((u) => (
              <option key={u._id} value={u._id}>
                {u.displayName} ({u.username})
              </option>
            ))}
          </select>
        </div>

        <div className={styles.form__field}>
          <label className={styles.form__label} htmlFor="credit-amount">
            금액
          </label>
          <input
            id="credit-amount"
            type="number"
            className={styles.form__input}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="양수 입력"
            min="1"
            required
          />
        </div>

        <div className={styles.form__field}>
          <label className={styles.form__label} htmlFor="credit-type">
            유형
          </label>
          <select
            id="credit-type"
            className={styles.form__select}
            value={type}
            onChange={(e) =>
              setType(e.target.value as CreditTransactionType)
            }
          >
            {GRANT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className={`${styles.form__field} ${styles["form__field--full"]}`}>
          <label className={styles.form__label} htmlFor="credit-desc">
            설명
          </label>
          <textarea
            id="credit-desc"
            className={styles.form__textarea}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="지급/차감 사유"
          />
        </div>
      </div>

      {error && <div className={styles.form__error}>{error}</div>}
      {success && <div className={styles.form__success}>{success}</div>}

      <div className={styles.form__actions}>
        <button
          type="button"
          className={styles.form__cancel}
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
          className={styles.form__submit}
          disabled={grantCredit.isPending}
        >
          {grantCredit.isPending ? "처리 중..." : "지급"}
        </button>
      </div>
    </form>
  );
}
