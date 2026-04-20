"use client";

import { useState } from "react";

import { useGrantCredit } from "@/hooks/mutations/useCreditMutation";

import type { CreditTransactionType } from "@/types/credit";
import type { UserPublic } from "@/types/user";

import Button from "@/components/ui/Button/Button";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import Input from "@/components/ui/Input/Input";
import Select from "@/components/ui/Select/Select";

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

  const [userId, setUserId] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<CreditTransactionType>("ADMIN_GRANT");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selectedUser = users.find((u) => u._id === userId);

  async function handleSubmit(e: React.FormEvent) {
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
          setSuccess("크레딧이 처리되었습니다.");
          setUserId("");
          setAmount("");
          setDescription("");
        },
        onError: (err) => {
          setError(err.message);
        },
      },
    );
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <label className={styles.field}>
        <Eyebrow>대상 유저</Eyebrow>
        <Select
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
        </Select>
      </label>

      <div className={styles.row}>
        <label className={styles.field}>
          <Eyebrow>금액</Eyebrow>
          <Input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="양수 입력"
            min="1"
            required
          />
        </label>

        <label className={styles.field}>
          <Eyebrow>유형</Eyebrow>
          <Select
            value={type}
            onChange={(e) => setType(e.target.value as CreditTransactionType)}
          >
            {GRANT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </label>
      </div>

      <label className={styles.field}>
        <Eyebrow>설명</Eyebrow>
        <Input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="지급/차감 사유"
        />
      </label>

      {error ? <div className={styles.error}>{error}</div> : null}
      {success ? <div className={styles.success}>{success}</div> : null}

      <div className={styles.actions}>
        <Button type="submit" variant="primary" disabled={grantCredit.isPending}>
          {grantCredit.isPending ? "처리 중..." : "지급"}
        </Button>
      </div>
    </form>
  );
}
