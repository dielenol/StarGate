"use client";

import { useState } from "react";

import { OPERATION_POOL_INITIAL_BALANCE } from "@/lib/credit-meta";
import { formatDate } from "@/lib/format/date";

import {
  type OpPoolDto,
  type OpPoolResponse,
  useCreditOpPool,
} from "@/hooks/queries/useCreditsAdminQuery";
import {
  OpPoolMutationError,
  useOpPoolMutation,
} from "@/hooks/mutations/useOpPoolMutation";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import Input from "@/components/ui/Input/Input";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";

import styles from "./CreditOpPoolPanel.module.css";

/* ── 타입 ── */

interface CreditOpPoolPanelProps {
  initialData: OpPoolResponse;
}

type AdjustMode = "credit" | "debit";

/* ── 컴포넌트 ── */

export default function CreditOpPoolPanel({
  initialData,
}: CreditOpPoolPanelProps) {
  const { data } = useCreditOpPool({ initialData });
  const opPoolMutation = useOpPoolMutation();

  /* (b) 조정 폼 상태 */
  const [mode, setMode] = useState<AdjustMode>("credit");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [allowNegative, setAllowNegative] = useState(false);

  /* 메시지 + 2단계 confirm */
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pendingConfirm, setPendingConfirm] = useState(false);

  // initialData 가 항상 시드되므로 data 는 사실상 항상 정의되지만 타입 가드.
  const exists = data?.exists ?? initialData.exists;
  const pool: OpPoolDto | null = data?.pool ?? initialData.pool;

  /* ── (a) 풀 미생성 — INIT 핸들러 ── */
  function handleInit() {
    setError("");
    setSuccess("");
    opPoolMutation.mutate(
      { action: "init" },
      {
        onSuccess: () => {
          setSuccess(
            `작전풀 초기화 완료 — 초기 잔액 ¤ ${OPERATION_POOL_INITIAL_BALANCE.toLocaleString()}`,
          );
        },
        onError: (err) => {
          setError(resolveErrorMessage(err));
        },
      },
    );
  }

  /* ── (b) 조정 — 검증 + 제출 ── */
  function validate(): string | null {
    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      return "양수 금액을 입력하세요.";
    }
    return null;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      setPendingConfirm(false);
      return;
    }

    // 감액은 2단계 confirm.
    if (mode === "debit" && !pendingConfirm) {
      setPendingConfirm(true);
      return;
    }

    runAdjust();
  }

  function cancelConfirm() {
    setPendingConfirm(false);
  }

  function runAdjust() {
    const numAmount = Math.abs(Number(amount));
    const signed = mode === "credit" ? numAmount : -numAmount;

    opPoolMutation.mutate(
      {
        action: "adjust",
        amount: signed,
        allowNegative: mode === "debit" ? allowNegative : false,
        // 서버는 description 을 현재 단계에서 무시(향후 audit 컬렉션 도입 대비 입력 위치 보존).
        description: description || undefined,
      },
      {
        onSuccess: () => {
          setSuccess(
            mode === "credit"
              ? `충전 완료 — +¤ ${numAmount.toLocaleString()}`
              : `감액 완료 — -¤ ${numAmount.toLocaleString()}`,
          );
          // 폼 초기화 (재진입 편의 — 금액/메모만 비움, 모드/허용옵션 보존).
          setAmount("");
          setDescription("");
          setPendingConfirm(false);
        },
        onError: (err) => {
          setError(resolveErrorMessage(err));
          setPendingConfirm(false);
        },
      },
    );
  }

  /* ── (a) 풀 미생성 ── */
  if (!exists || !pool) {
    return (
      <Box>
        <PanelTitle>OP POOL</PanelTitle>
        <div className={styles.opPool__layout}>
          <div className={styles.opPool__emptyState}>
            <span>작전 크레딧 풀이 아직 생성되지 않았습니다.</span>
            <span className={styles.opPool__emptyHint}>
              초기 잔액 · ¤ {OPERATION_POOL_INITIAL_BALANCE.toLocaleString()}
            </span>
          </div>

          {error ? <div className={styles.opPool__error}>{error}</div> : null}
          {success ? (
            <div className={styles.opPool__success}>
              <span>{success}</span>
              <button
                type="button"
                className={styles.opPool__successDismiss}
                onClick={() => setSuccess("")}
              >
                닫기
              </button>
            </div>
          ) : null}

          <div className={styles.opPool__initActions}>
            <Button
              type="button"
              variant="primary"
              onClick={handleInit}
              disabled={opPoolMutation.isPending}
            >
              {opPoolMutation.isPending ? "처리 중..." : "INIT 풀 생성"}
            </Button>
          </div>
        </div>
      </Box>
    );
  }

  /* ── (b) 풀 활성 ── */
  const balanceClass =
    pool.balance < 0 ? styles.opPool__bigNumNeg : styles.opPool__bigNum;

  return (
    <Box variant="gold">
      <PanelTitle>OP POOL</PanelTitle>
      <div className={styles.opPool__layout}>
        {/* 잔액 카드 */}
        <div className={styles.opPool__balanceCard}>
          <Eyebrow tone="gold">CURRENT POOL BALANCE</Eyebrow>
          <div className={balanceClass}>¤ {pool.balance.toLocaleString()}</div>
          <div className={styles.opPool__balanceMeta}>
            <span className={styles.opPool__poolName}>{pool.name}</span>
            <span className={styles.opPool__updatedAt}>
              UPDATED · {formatDate(pool.updatedAt)}
            </span>
          </div>
        </div>

        {/* 조정 폼 */}
        <form className={styles.opPool__form} onSubmit={handleSubmit}>
          <div>
            <Eyebrow>조정</Eyebrow>
            <div className={styles.opPool__modeRow}>
              <button
                type="button"
                className={`${styles.opPool__modeBtn} ${
                  mode === "credit" ? styles.opPool__modeBtnActive : ""
                }`}
                onClick={() => {
                  setMode("credit");
                  setError("");
                  setSuccess("");
                  setPendingConfirm(false);
                }}
              >
                충전
              </button>
              <button
                type="button"
                className={`${styles.opPool__modeBtn} ${
                  mode === "debit" ? styles.opPool__modeBtnActive : ""
                }`}
                onClick={() => {
                  setMode("debit");
                  setError("");
                  setSuccess("");
                  setPendingConfirm(false);
                }}
              >
                감액
              </button>
            </div>
          </div>

          <div className={styles.opPool__row}>
            <label className={styles.opPool__field}>
              <Eyebrow>금액</Eyebrow>
              <Input
                type="number"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setError("");
                  setPendingConfirm(false);
                }}
                placeholder="양수 입력"
                min="1"
                required
              />
            </label>

            <label className={styles.opPool__field}>
              <Eyebrow>메모</Eyebrow>
              <Input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="조정 사유"
              />
            </label>
          </div>
          <div className={styles.opPool__hint}>
            메모 — 현재 단계에서는 보존되지 않음
          </div>

          {mode === "debit" ? (
            <label className={styles.opPool__allowNegLabel}>
              <input
                type="checkbox"
                checked={allowNegative}
                onChange={(e) => {
                  setAllowNegative(e.target.checked);
                  setError("");
                  setPendingConfirm(false);
                }}
              />
              잔액 음수 진입 허용
            </label>
          ) : null}

          {error ? <div className={styles.opPool__error}>{error}</div> : null}
          {success ? (
            <div className={styles.opPool__success}>
              <span>{success}</span>
              <button
                type="button"
                className={styles.opPool__successDismiss}
                onClick={() => setSuccess("")}
              >
                닫기
              </button>
            </div>
          ) : null}

          {pendingConfirm ? (
            <div className={styles.opPool__confirmBox}>
              <span>
                정말 감액하시겠습니까? -¤{" "}
                {Math.abs(Number(amount) || 0).toLocaleString()}
                {allowNegative ? " (음수 진입 허용)" : ""}
              </span>
              <span className={styles.opPool__confirmActions}>
                <Button type="button" onClick={cancelConfirm}>
                  취소
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={opPoolMutation.isPending}
                >
                  {opPoolMutation.isPending ? "처리 중..." : "확인 감액"}
                </Button>
              </span>
            </div>
          ) : (
            <div className={styles.opPool__actions}>
              <Button
                type="submit"
                variant="primary"
                disabled={opPoolMutation.isPending}
              >
                {opPoolMutation.isPending ? "처리 중..." : "실행"}
              </Button>
            </div>
          )}
        </form>
      </div>
    </Box>
  );
}

/* ── 헬퍼 ── */

/** 서버 코드별 한국어 메시지 매핑. 알 수 없는 코드면 서버 message 그대로. */
function resolveErrorMessage(err: unknown): string {
  if (err instanceof OpPoolMutationError) {
    switch (err.code) {
      case "POOL_INSUFFICIENT":
        return "잔액 부족 — 음수 진입 허용 옵션 필요";
      case "POOL_NOT_FOUND":
        return "풀이 사라졌습니다 — 새로고침";
      case "POOL_EXISTS":
        return "풀이 이미 초기화되어 있습니다 — 새로고침";
      default:
        return err.message;
    }
  }
  return err instanceof Error ? err.message : "처리에 실패했습니다.";
}
