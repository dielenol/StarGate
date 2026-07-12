"use client";

import { useMemo, useState } from "react";

import type { CreditTransactionType } from "@/types/credit";
import type {
  BulkGrantInput,
  BulkGrantResult,
  BulkGrantResultItem,
  BulkGrantTarget,
  RewardKind,
} from "@/types/credit-admin";

import { useBulkGrantCredit } from "@/hooks/mutations/useCreditMutation";

import Button from "@/components/ui/Button/Button";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import Input from "@/components/ui/Input/Input";
import Select from "@/components/ui/Select/Select";

import { STOCK_CATALOG } from "@/lib/stocks/catalog";

import styles from "./CreditBulkGrantForm.module.css";

/* ── 상수 ── */

const GRANT_TYPES: { value: CreditTransactionType; label: string }[] = [
  { value: "ADMIN_GRANT", label: "관리자 지급" },
  { value: "ADMIN_DEDUCT", label: "관리자 차감" },
  { value: "SESSION_REWARD", label: "세션 보상" },
];

const REWARD_KINDS: { value: RewardKind; label: string }[] = [
  { value: "CREDIT", label: "CREDIT" },
  { value: "POINT", label: "POINT" },
  { value: "STOCK", label: "STOCK" },
];

const MAX_TARGETS = 100;

function getRewardUnit(kind: RewardKind): string {
  if (kind === "STOCK") return "주";
  return kind === "POINT" ? "PT" : "CR";
}

function getRewardAmountLabel(kind: RewardKind): string {
  if (kind === "STOCK") return "주식 수량";
  return kind === "POINT" ? "포인트" : "크레딧";
}

function getBalanceColumnLabel(kind: RewardKind): string {
  if (kind === "STOCK") return "보유 수량";
  return kind === "POINT" ? "새 포인트" : "새 크레딧";
}

/* ── 타입 ── */

/**
 * GM 발급 폼이 필요한 user 정보 + 메인 캐릭 매핑.
 * 서버에서 미리 매핑해 넘겨줌으로써 UI 가 추가 fetch 없이 캐릭 codename 표시.
 */
export interface GrantTargetUser {
  userId: string;
  username: string;
  displayName: string;
  /** 운영 메인 캐릭터의 _id hex. 미등록이면 null — 발급 불가 표시. */
  mainCharacterId: string | null;
  /** 운영 메인 캐릭터의 codename. */
  mainCharacterCodename: string | null;
  /** 운영 메인 캐릭터 타입. GM NPC fallback이면 NPC. */
  mainCharacterType: "AGENT" | "NPC" | null;
  /**
   * 메인 캐릭이 더미(isPublic === false) 인지 여부. 발급은 가능하지만
   * UI 가 [DUMMY] 로 시각 구분 — GM 오발급 방지용 힌트.
   */
  isDummy?: boolean;
  /** ACTIVE GM 계정에 배정된 단일 NPC를 운영 메인으로 쓰는 경우. */
  isNpcFallback?: boolean;
}

interface CreditBulkGrantFormProps {
  /** 메인 미등록자는 picker 모드에서 disabled 로 노출. */
  targets: GrantTargetUser[];
  /**
   * 외부(예: 잔액 보드의 [발급] 버튼)가 owner 1명을 prefill 하도록 한다.
   * truthy 값이 들어오면 picker 모드 + 해당 owner 단독 체크로 전환.
   */
  prefillOwnerId?: string;
  /** prefill 적용 후 부모 state 를 비우기 위한 콜백 (재발화 방지). */
  onPrefillConsumed?: () => void;
}

type InputMode = "picker" | "paste";

interface PasteTarget {
  raw: string;
  ok: boolean;
  /** 검증 실패 사유 — paste 모드 hint 에 노출. */
  invalidReason?: string;
}

/* ── 컴포넌트 ── */

export default function CreditBulkGrantForm({
  targets,
  prefillOwnerId,
  onPrefillConsumed,
}: CreditBulkGrantFormProps) {
  const bulkGrant = useBulkGrantCredit();

  /* 입력 모드 */
  const [mode, setMode] = useState<InputMode>("picker");

  /* (a) picker 모드 — 메인 보유자 우선 정렬, 검색 필터 + 체크 선택 */
  const [search, setSearch] = useState("");
  const [pickedOwnerIds, setPickedOwnerIds] = useState<Set<string>>(new Set());

  /* (b) paste 모드 — 줄단위 ID 입력 */
  const [pasteText, setPasteText] = useState("");
  const [pasteIsCharacterId, setPasteIsCharacterId] = useState(false);

  /* 공통 입력 */
  const [rewardKind, setRewardKind] = useState<RewardKind>("CREDIT");
  const [stockTicker, setStockTicker] = useState(STOCK_CATALOG[0]?.ticker ?? "");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<CreditTransactionType>("ADMIN_GRANT");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  /* ADMIN_DEDUCT 2단계 confirm */
  const [pendingConfirm, setPendingConfirm] = useState(false);

  /* 결과 */
  const [result, setResult] = useState<BulkGrantResult | null>(null);
  const [showFailedOnly, setShowFailedOnly] = useState(false);

  /* ── picker 모드: 정렬 + 검색 필터 ── */
  const sortedTargets = useMemo(() => {
    const copy = [...targets].sort((a, b) => {
      // 메인 보유자 위.
      if (Boolean(a.mainCharacterId) !== Boolean(b.mainCharacterId)) {
        return a.mainCharacterId ? -1 : 1;
      }
      // SSR/CSR locale 차이로 hydration 순서가 바뀌지 않도록
      // 코드 포인트 비교와 userId tie-breaker를 사용한다.
      if (a.displayName !== b.displayName) {
        return a.displayName < b.displayName ? -1 : 1;
      }
      if (a.userId === b.userId) return 0;
      return a.userId < b.userId ? -1 : 1;
    });
    return copy;
  }, [targets]);

  const filteredTargets = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedTargets;
    return sortedTargets.filter((t) => {
      const codename = (t.mainCharacterCodename ?? "").toLowerCase();
      const display = t.displayName.toLowerCase();
      const username = t.username.toLowerCase();
      return (
        codename.includes(q) || display.includes(q) || username.includes(q)
      );
    });
  }, [sortedTargets, search]);

  // 전체 선택 토글 — 현재 가시 + 메인 보유자만 대상.
  const visibleEligibleIds = useMemo(
    () =>
      filteredTargets
        .filter((t) => t.mainCharacterId !== null)
        .map((t) => t.userId),
    [filteredTargets],
  );

  const allVisibleSelected =
    visibleEligibleIds.length > 0 &&
    visibleEligibleIds.every((id) => pickedOwnerIds.has(id));

  function toggleAllVisible() {
    setPickedOwnerIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const id of visibleEligibleIds) next.delete(id);
      } else {
        for (const id of visibleEligibleIds) next.add(id);
      }
      return next;
    });
    setError("");
  }

  function togglePicked(ownerId: string) {
    setPickedOwnerIds((prev) => {
      const next = new Set(prev);
      if (next.has(ownerId)) next.delete(ownerId);
      else next.add(ownerId);
      return next;
    });
    setError("");
  }

  // 외부 prefill(예: 잔액 보드 [발급]) 흡수 — picker 모드로 전환 + 단독 체크.
  // 부모가 null 로 비우면 lastPrefill 도 reset → 같은 값 재진입 허용 (행 재클릭 사용성).
  // React 권장 derived-state-from-prop 패턴 (useEffect cascading render 방지).
  const [lastPrefill, setLastPrefill] = useState<string | null>(null);
  if (prefillOwnerId == null && lastPrefill !== null) {
    setLastPrefill(null);
  } else if (prefillOwnerId && prefillOwnerId !== lastPrefill) {
    setLastPrefill(prefillOwnerId);
    setMode("picker");
    setPickedOwnerIds(new Set([prefillOwnerId]));
    setError("");
    setPendingConfirm(false);
    // 이전 일괄 발급 결과 화면이 떠 있으면 폼이 가려지므로 함께 reset.
    setResult(null);
    setShowFailedOnly(false);
    // paste 모드의 옛 입력/토글이 살아있으면 다음 모드 전환 시 오인 — picker 단독 의도와 충돌.
    setPasteText("");
    setPasteIsCharacterId(false);
    onPrefillConsumed?.();
  }

  /* ── paste 모드: 라인 파싱 ── */
  const parsedPaste = useMemo<PasteTarget[]>(() => {
    return pasteText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((raw) => {
        // ObjectId 24자 hex 형식 검증.
        const ok = /^[0-9a-fA-F]{24}$/.test(raw);
        return ok
          ? { raw, ok: true }
          : { raw, ok: false, invalidReason: "ObjectId(24자 hex) 형식 아님" };
      });
  }, [pasteText]);

  const validPasteCount = parsedPaste.filter((p) => p.ok).length;
  const invalidPasteCount = parsedPaste.length - validPasteCount;

  /* ── 선택 카운트 ── */
  const selectedCount =
    mode === "picker" ? pickedOwnerIds.size : validPasteCount;

  /* ── 빌드 BulkGrantInput.targets ── */
  function buildTargets(): BulkGrantTarget[] {
    if (mode === "picker") {
      return Array.from(pickedOwnerIds).map((ownerId) => ({ ownerId }));
    }
    return parsedPaste
      .filter((p) => p.ok)
      .map((p) =>
        pasteIsCharacterId ? { characterId: p.raw } : { ownerId: p.raw },
      );
  }

  /* ── 검증 ── */
  function validate(): string | null {
    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount === 0) {
      return `유효한 ${getRewardAmountLabel(rewardKind)}을 입력하세요 (0 또는 NaN 불가).`;
    }
    if (rewardKind === "STOCK") {
      if (type === "ADMIN_DEDUCT") {
        return "주식 보상은 차감 유형으로 처리할 수 없습니다.";
      }
      if (!Number.isInteger(numAmount) || numAmount <= 0) {
        return "주식 보상 수량은 0보다 큰 정수여야 합니다.";
      }
      if (!stockTicker) {
        return "지급할 주식 종목을 선택하세요.";
      }
    }
    if (selectedCount === 0) {
      return mode === "picker"
        ? "최소 1명의 대상자를 선택하세요."
        : "최소 1개의 유효한 ID를 입력하세요.";
    }
    if (selectedCount > MAX_TARGETS) {
      return `한 번에 ${MAX_TARGETS}건 이하로 선택해주세요. (현재 ${selectedCount}건)`;
    }
    return null;
  }

  /* ── 제출 ── */
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      setPendingConfirm(false);
      return;
    }

    // ADMIN_DEDUCT 는 2단계 confirm.
    if (type === "ADMIN_DEDUCT" && !pendingConfirm) {
      setPendingConfirm(true);
      return;
    }

    runMutation();
  }

  function cancelConfirm() {
    setPendingConfirm(false);
  }

  function runMutation() {
    const payload: BulkGrantInput = {
      targets: buildTargets(),
      amount: Math.abs(Number(amount)),
      type: type as "ADMIN_GRANT" | "ADMIN_DEDUCT" | "SESSION_REWARD",
      rewardKind,
      stockTicker: rewardKind === "STOCK" ? stockTicker : undefined,
      description,
    };

    bulkGrant.mutate(payload, {
      onSuccess: (data) => {
        setResult(data);
        setPendingConfirm(false);
        // 성공 응답 받았으니 다음 일괄 발급 전까지 폼 보존(재발급 편의) — reset 은 [새 일괄 발급] 버튼이.
      },
      onError: (err) => {
        setError(err.message);
        setPendingConfirm(false);
      },
    });
  }

  /* ── 결과 reset (새 일괄 발급) ── */
  function resetForm() {
    setResult(null);
    setShowFailedOnly(false);
    setError("");
    setPendingConfirm(false);
    setPickedOwnerIds(new Set());
    setPasteText("");
    setPasteIsCharacterId(false);
    setAmount("");
    setDescription("");
  }

  /* ── 결과 행 필터 ── */
  const visibleResultRows = useMemo<BulkGrantResultItem[]>(() => {
    if (!result) return [];
    if (!showFailedOnly) return result.results;
    return result.results.filter((r) => !r.success);
  }, [result, showFailedOnly]);

  /* ── 결과 화면 ── */
  if (result) {
    return (
      <div>
        <div className={styles.bulk__resultsHeader}>
          <div className={styles.bulk__statRow}>
            <div className={styles.bulk__statBlock}>
              <span
                className={`${styles.bulk__statBig} ${styles.bulk__statBigOk}`}
              >
                {result.succeeded}
              </span>
              <span className={styles.bulk__statLabel}>성공</span>
            </div>
            <div className={styles.bulk__statBlock}>
              <span
                className={`${styles.bulk__statBig} ${styles.bulk__statBigFail}`}
              >
                {result.failed}
              </span>
              <span className={styles.bulk__statLabel}>실패</span>
            </div>
            <div className={styles.bulk__statBlock}>
              <span
                className={`${styles.bulk__statBig} ${styles.bulk__statBigSkip}`}
              >
                {result.skipped}
              </span>
              <span className={styles.bulk__statLabel}>건너뜀</span>
            </div>
          </div>

          <div className={styles.bulk__resultsControls}>
            <label className={styles.bulk__filterCheck}>
              <input
                type="checkbox"
                checked={showFailedOnly}
                onChange={(e) => setShowFailedOnly(e.target.checked)}
              />
              실패만 보기
            </label>
            <Button type="button" variant="primary" onClick={resetForm}>
              새 일괄 발급
            </Button>
          </div>
        </div>

        <div className={styles.bulk__resultsTableWrap}>
          {visibleResultRows.length === 0 ? (
            <div className={styles.bulk__resultsEmpty}>
              표시할 결과가 없습니다.
            </div>
          ) : (
            <table className={styles.bulk__resultsTable}>
              <thead>
                <tr>
                  <th>결과</th>
                  <th>코드네임</th>
                  <th className={styles.bulk__numCol}>처리 수량</th>
                  <th className={styles.bulk__numCol}>
                    {getBalanceColumnLabel(rewardKind)}
                  </th>
                  <th>
                    {rewardKind === "POINT" || rewardKind === "STOCK"
                      ? "사유 / 기록"
                      : "사유 / 거래 ID"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleResultRows.map((row, idx) => (
                  <tr key={`${row.characterId ?? row.ownerId ?? idx}-${idx}`}>
                    <td
                      className={
                        row.success ? styles.bulk__rowOk : styles.bulk__rowFail
                      }
                    >
                      {row.success ? "OK" : "FAIL"}
                    </td>
                    <td>
                      {row.characterCodename ?? (
                        <span className={styles.bulk__txId}>
                          {row.characterId ?? row.ownerId ?? "-"}
                        </span>
                      )}
                    </td>
                    <td className={styles.bulk__numCol}>
                      {row.success
                        ? formatAmount(amount, type, rewardKind)
                        : "-"}
                    </td>
                    <td className={styles.bulk__numCol}>
                      {rewardKind === "POINT" && row.newPointBalance != null
                        ? `${row.newPointBalance.toLocaleString()} PT`
                        : rewardKind === "STOCK" && row.newStockShares != null
                          ? `${row.stockTicker ?? ""} ${row.newStockShares.toLocaleString()}주`
                        : row.newBalance != null
                          ? `${row.newBalance.toLocaleString()} CR`
                          : "-"}
                    </td>
                    <td>
                      {row.success ? (
                        <span className={styles.bulk__txId}>
                          {row.transactionId ?? "-"}
                        </span>
                      ) : (
                        <>
                          {row.code ? (
                            <span className={styles.bulk__codeChip}>
                              {row.code}
                            </span>
                          ) : null}
                          {row.error ?? row.skipReason ?? "-"}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  /* ── 입력 폼 화면 ── */
  return (
    <form className={styles.bulk__form} onSubmit={handleSubmit}>
      <div>
        <Eyebrow>입력 모드</Eyebrow>
        <div className={styles.bulk__modeRow}>
          <button
            type="button"
            className={`${styles.bulk__modeBtn} ${
              mode === "picker" ? styles.bulk__modeBtnActive : ""
            }`}
            onClick={() => {
              setMode("picker");
              setError("");
              setPendingConfirm(false);
            }}
          >
            대상자 선택
          </button>
          <button
            type="button"
            className={`${styles.bulk__modeBtn} ${
              mode === "paste" ? styles.bulk__modeBtnActive : ""
            }`}
            onClick={() => {
              setMode("paste");
              setError("");
              setPendingConfirm(false);
            }}
          >
            ID 붙여넣기
          </button>
        </div>
        <div className={styles.bulk__hint}>
          {mode === "picker"
            ? "운영 메인 캐릭터를 보유한 사용자만 선택 가능합니다 ([NPC]는 GM 운영 캐릭터, [DUMMY]는 테스트 캐릭터)."
            : "한 줄에 하나의 ID를 입력하세요. 기본은 ownerId(사용자 _id)이며, 체크 시 characterId 로 해석됩니다."}
        </div>
      </div>

      {mode === "picker" ? (
        <div className={styles.bulk__field}>
          <div className={styles.bulk__pickerHeader}>
            <div className={styles.bulk__pickerControls}>
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="codename / 이름 검색"
                className={styles.bulk__searchInput}
              />
              <Button
                type="button"
                size="sm"
                onClick={toggleAllVisible}
                disabled={visibleEligibleIds.length === 0}
              >
                {allVisibleSelected ? "전체 해제" : "전체 선택"}
              </Button>
            </div>
            <span className={styles.bulk__selectedCount}>
              선택됨 {pickedOwnerIds.size}건
            </span>
          </div>

          <div className={styles.bulk__targetList}>
            {filteredTargets.length === 0 ? (
              <div className={styles.bulk__resultsEmpty}>
                일치하는 대상자가 없습니다.
              </div>
            ) : (
              filteredTargets.map((t) => {
                const eligible = t.mainCharacterId !== null;
                const checked = pickedOwnerIds.has(t.userId);
                const rowClass = eligible
                  ? styles.bulk__targetRow
                  : `${styles.bulk__targetRow} ${styles.bulk__targetRowDisabled}`;
                return (
                  <label key={t.userId} className={rowClass}>
                    <input
                      type="checkbox"
                      checked={eligible && checked}
                      disabled={!eligible}
                      onChange={() => eligible && togglePicked(t.userId)}
                    />
                    <span className={styles.bulk__targetCodename}>
                      {t.mainCharacterCodename ?? "(미등록)"}
                    </span>
                    {t.isDummy ? (
                      <span className={styles.bulk__targetDummy}>DUMMY</span>
                    ) : null}
                    {t.isNpcFallback ? (
                      <span className={styles.bulk__targetDummy}>NPC</span>
                    ) : null}
                    <span className={styles.bulk__targetMeta}>
                      {t.displayName} ({t.username})
                    </span>
                    {!eligible ? (
                      <span className={styles.bulk__targetWarn}>
                        운영 메인 미등록
                      </span>
                    ) : null}
                  </label>
                );
              })
            )}
          </div>
        </div>
      ) : (
        <div className={styles.bulk__field}>
          <Eyebrow>ID 목록 (한 줄당 하나)</Eyebrow>
          <textarea
            className={styles.bulk__textarea}
            value={pasteText}
            onChange={(e) => {
              setPasteText(e.target.value);
              setError("");
            }}
            placeholder={"5f8b2c7e9d3a1b4e6c8d0f2a\n5f8b2c7e9d3a1b4e6c8d0f2b\n..."}
          />
          <div className={styles.bulk__pasteOptions}>
            <label className={styles.bulk__pasteCheckLabel}>
              <input
                type="checkbox"
                checked={pasteIsCharacterId}
                onChange={(e) => setPasteIsCharacterId(e.target.checked)}
              />
              이 ID 들은 characterId 입니다 (기본: ownerId)
            </label>
          </div>
          <div className={styles.bulk__hint}>
            유효 {validPasteCount}건
            {invalidPasteCount > 0 ? ` · 형식 오류 ${invalidPasteCount}건` : ""}
          </div>
        </div>
      )}

      <div className={styles.bulk__row}>
        <label className={styles.bulk__field}>
          <Eyebrow>REWARD</Eyebrow>
          <Select
            value={rewardKind}
            onChange={(e) => {
              const nextRewardKind = e.target.value as RewardKind;
              setRewardKind(nextRewardKind);
              if (nextRewardKind === "STOCK" && type === "ADMIN_DEDUCT") {
                setType("ADMIN_GRANT");
              }
              setError("");
              setPendingConfirm(false);
            }}
          >
            {REWARD_KINDS.map((kind) => (
              <option key={kind.value} value={kind.value}>
                {kind.label}
              </option>
            ))}
          </Select>
        </label>

        <label className={styles.bulk__field}>
          <Eyebrow>{getRewardAmountLabel(rewardKind)}</Eyebrow>
          <Input
            type="number"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setError("");
              setPendingConfirm(false);
            }}
            placeholder={`${getRewardUnit(rewardKind)} 양수 입력`}
            min="1"
            step="1"
            required
          />
        </label>

        {rewardKind === "STOCK" ? (
          <label className={styles.bulk__field}>
            <Eyebrow>종목</Eyebrow>
            <Select
              value={stockTicker}
              onChange={(e) => {
                setStockTicker(e.target.value);
                setError("");
                setPendingConfirm(false);
              }}
            >
              {STOCK_CATALOG.map((stock) => (
                <option key={stock.ticker} value={stock.ticker}>
                  {stock.ticker} · {stock.name}
                </option>
              ))}
            </Select>
          </label>
        ) : null}

        <label className={styles.bulk__field}>
          <Eyebrow>유형</Eyebrow>
          <Select
            value={type}
            onChange={(e) => {
              setType(e.target.value as CreditTransactionType);
              setError("");
              setPendingConfirm(false);
            }}
          >
            {GRANT_TYPES.filter(
              (t) => rewardKind !== "STOCK" || t.value !== "ADMIN_DEDUCT",
            ).map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </label>
      </div>

      <label className={styles.bulk__field}>
        <Eyebrow>설명</Eyebrow>
        <Input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="지급/차감 사유"
        />
      </label>

      {error ? <div className={styles.bulk__error}>{error}</div> : null}

      {pendingConfirm ? (
        <div className={styles.bulk__confirm}>
          <span>
            정말 차감하시겠습니까? {selectedCount}명 ×{" "}
            {Math.abs(Number(amount) || 0).toLocaleString()}{" "}
            {getRewardUnit(rewardKind)}
          </span>
          <span className={styles.bulk__confirmActions}>
            <Button type="button" onClick={cancelConfirm}>
              취소
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={bulkGrant.isPending}
            >
              {bulkGrant.isPending ? "처리 중..." : "확인 차감"}
            </Button>
          </span>
        </div>
      ) : (
        <div className={styles.bulk__actions}>
          <Button
            type="submit"
            variant="primary"
            disabled={bulkGrant.isPending}
          >
            {bulkGrant.isPending ? "처리 중..." : "지급"}
          </Button>
        </div>
      )}
    </form>
  );
}

/* ── 헬퍼 ── */

function formatAmount(
  amount: string,
  type: CreditTransactionType,
  rewardKind: RewardKind,
): string {
  const n = Math.abs(Number(amount) || 0);
  const signed = type === "ADMIN_DEDUCT" ? -n : n;
  const formatted = signed.toLocaleString();
  const unit = getRewardUnit(rewardKind);
  return `${signed > 0 ? `+${formatted}` : formatted} ${unit}`;
}
