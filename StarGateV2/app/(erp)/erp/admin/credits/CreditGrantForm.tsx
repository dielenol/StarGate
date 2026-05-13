"use client";

import { useMemo, useState } from "react";

import type { CreditTransactionType } from "@/types/credit";

import { useGrantCredit } from "@/hooks/mutations/useCreditMutation";

import Button from "@/components/ui/Button/Button";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import Input from "@/components/ui/Input/Input";
import Select from "@/components/ui/Select/Select";

import styles from "./CreditGrantForm.module.css";

/* ── 상수 ── */

const GRANT_TYPES: { value: CreditTransactionType; label: string }[] = [
  { value: "ADMIN_GRANT", label: "관리자 지급" },
  { value: "ADMIN_DEDUCT", label: "관리자 차감" },
  { value: "SESSION_REWARD", label: "세션 보상" },
];

/* ── 타입 ── */

/**
 * GM 발급 폼이 필요한 user 정보 + 메인 캐릭 매핑.
 * 서버에서 미리 매핑해 넘겨줌으로써 UI 가 추가 fetch 없이 캐릭 codename 표시.
 */
export interface GrantTargetUser {
  userId: string;
  username: string;
  displayName: string;
  /** 메인 AGENT 캐릭터의 _id hex. 미등록이면 null — 발급 불가 표시. */
  mainCharacterId: string | null;
  /** 메인 AGENT 캐릭터의 codename. */
  mainCharacterCodename: string | null;
  /**
   * 메인 캐릭이 더미(isPublic === false) 인지 여부. 발급은 가능하지만
   * UI 가 [DUMMY] 로 시각 구분 — GM 오발급 방지용 힌트.
   */
  isDummy?: boolean;
}

interface CreditGrantFormProps {
  targets: GrantTargetUser[];
  /**
   * 외부(예: 잔액 보드의 [발급] 버튼) 가 캐릭터를 선택해 폼을 prefill 하도록 한다.
   * truthy 값이 들어오면 mode = "character" 로 전환 + characterId 세팅.
   */
  prefillCharacterId?: string;
  /** prefill 적용 후 부모 state 를 비우기 위한 콜백 (재발화 방지). */
  onPrefillConsumed?: () => void;
}

type RoutingMode = "owner" | "character";

/* ── 컴포넌트 ── */

export default function CreditGrantForm({
  targets,
  prefillCharacterId,
  onPrefillConsumed,
}: CreditGrantFormProps) {
  const grantCredit = useGrantCredit();

  const [mode, setMode] = useState<RoutingMode>("owner");
  const [ownerId, setOwnerId] = useState("");
  const [characterId, setCharacterId] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<CreditTransactionType>("ADMIN_GRANT");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // owner 모드용 — 메인 캐릭 보유자 우선, 미등록자는 하단 disabled 로 노출 (silent drop 금지).
  const ownerOptions = useMemo(() => {
    const sorted = [...targets].sort((a, b) => {
      // 1차: 메인 보유자가 위.
      if (Boolean(a.mainCharacterId) !== Boolean(b.mainCharacterId)) {
        return a.mainCharacterId ? -1 : 1;
      }
      // 2차: displayName 알파벳.
      return a.displayName.localeCompare(b.displayName);
    });
    return sorted;
  }, [targets]);

  // character 모드용 — 메인 캐릭이 있는 user 의 캐릭터만 노출 (1인 1 MAIN 전제).
  const characterOptions = useMemo(
    () =>
      targets
        .filter((t) => t.mainCharacterId !== null)
        .map((t) => ({
          characterId: t.mainCharacterId as string,
          codename: t.mainCharacterCodename as string,
          ownerLabel: `${t.displayName} (${t.username})`,
          isDummy: Boolean(t.isDummy),
        })),
    [targets],
  );

  // prefill 동기화 — useEffect 가 아닌 render-time 패턴으로 prop 변경에 반응.
  // 부모가 같은 prefill 값을 두 번 보내도 수용해야 하므로 (행 재클릭 사용성)
  // 부모가 null 로 비울 때 lastPrefill 도 함께 null 로 reset → 다음 truthy 값을 새로 흡수.
  // React 권장 derived-state-from-prop 패턴 (useEffect cascading render 방지).
  const [lastPrefill, setLastPrefill] = useState<string | null>(null);
  if (prefillCharacterId == null && lastPrefill !== null) {
    setLastPrefill(null);
  } else if (prefillCharacterId && prefillCharacterId !== lastPrefill) {
    setLastPrefill(prefillCharacterId);
    setMode("character");
    setCharacterId(prefillCharacterId);
    setError("");
    setSuccess("");
    // 부모에게 흡수 완료 통지 — 부모가 null 로 비우면 다음 클릭(같은 값 포함) 에 정상 반응.
    onPrefillConsumed?.();
  }

  const selectedOwner = ownerOptions.find((t) => t.userId === ownerId);
  const selectedCharacter = characterOptions.find(
    (c) => c.characterId === characterId,
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount === 0) {
      setError("유효한 금액을 입력하세요.");
      return;
    }

    if (mode === "owner" && !ownerId) {
      setError("대상 사용자를 선택하세요.");
      return;
    }
    if (mode === "character" && !characterId) {
      setError("대상 캐릭터를 선택하세요.");
      return;
    }

    const finalAmount =
      type === "ADMIN_DEDUCT" ? -Math.abs(numAmount) : Math.abs(numAmount);

    grantCredit.mutate(
      {
        ownerId: mode === "owner" ? ownerId : undefined,
        characterId: mode === "character" ? characterId : undefined,
        amount: finalAmount,
        type,
        description,
      },
      {
        onSuccess: () => {
          setSuccess("크레딧이 처리되었습니다.");
          setOwnerId("");
          setCharacterId("");
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
      <div>
        <Eyebrow>대상 라우팅</Eyebrow>
        <div className={styles.modeRow}>
          <button
            type="button"
            className={`${styles.modeBtn} ${
              mode === "owner" ? styles.modeBtnActive : ""
            }`}
            onClick={() => setMode("owner")}
          >
            사용자 선택
          </button>
          <button
            type="button"
            className={`${styles.modeBtn} ${
              mode === "character" ? styles.modeBtnActive : ""
            }`}
            onClick={() => setMode("character")}
          >
            캐릭터 직접 지정
          </button>
        </div>
        <div className={styles.hint}>
          {mode === "owner"
            ? "사용자를 선택하면 해당 사용자의 메인 AGENT 캐릭터로 자동 라우팅됩니다."
            : "캐릭터를 직접 선택합니다 (메인 캐릭터만 노출)."}
        </div>
      </div>

      {mode === "owner" ? (
        <label className={styles.field}>
          <Eyebrow>대상 사용자</Eyebrow>
          <Select
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
            required
          >
            <option value="">-- 사용자 선택 --</option>
            {ownerOptions.map((t) => (
              <option
                key={t.userId}
                value={t.userId}
                disabled={!t.mainCharacterId}
              >
                {t.displayName} ({t.username})
                {t.mainCharacterId
                  ? ` · ${t.mainCharacterCodename}${t.isDummy ? " [DUMMY]" : ""}`
                  : " · ⚠ 메인 캐릭터 미등록 (발급 불가)"}
              </option>
            ))}
          </Select>
          {selectedOwner ? (
            <div className={styles.hint}>
              메인 캐릭: <b>{selectedOwner.mainCharacterCodename}</b>
              {selectedOwner.isDummy ? " · ⚠ DUMMY 캐릭" : ""}
            </div>
          ) : null}
        </label>
      ) : (
        <label className={styles.field}>
          <Eyebrow>대상 캐릭터</Eyebrow>
          <Select
            value={characterId}
            onChange={(e) => setCharacterId(e.target.value)}
            required
          >
            <option value="">-- 캐릭터 선택 --</option>
            {characterOptions.map((c) => (
              <option key={c.characterId} value={c.characterId}>
                {c.codename}
                {c.isDummy ? " [DUMMY]" : ""} · {c.ownerLabel}
              </option>
            ))}
          </Select>
          {selectedCharacter ? (
            <div className={styles.hint}>
              소유자: {selectedCharacter.ownerLabel}
            </div>
          ) : null}
        </label>
      )}

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
