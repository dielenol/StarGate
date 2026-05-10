"use client";

import { useState } from "react";

import type {
  BulkGrantResult,
  BulkGrantResultItem,
  SessionRespondent,
  SessionRespondentStatus,
  SessionRewardCandidate,
} from "@/types/credit-admin";

import { useSessionRewardMutation } from "@/hooks/mutations/useSessionRewardMutation";
import { useCreditSessionCandidates } from "@/hooks/queries/useCreditsAdminQuery";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import Input from "@/components/ui/Input/Input";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";
import Select from "@/components/ui/Select/Select";

import { formatDate } from "@/lib/format/date";

import styles from "./CreditSessionRewardPanel.module.css";

/* ── 상수 ── */

const DAYS_BACK_OPTIONS = [7, 14, 30, 60] as const;
const DEFAULT_DAYS_BACK = 14;
const DEFAULT_AMOUNT = 50;

const STATUS_LABEL: Record<SessionRespondentStatus, string> = {
  eligible: "지급 가능",
  "no-user": "USER 미매칭",
  "no-character": "MAIN 미등록",
  "integrity-violation": "MAIN 정합성 위반",
  "already-rewarded": "이미 발급",
};

const CHIP_CLASS: Record<SessionRespondentStatus, string> = {
  eligible: styles.session__chipEligible,
  "no-user": styles.session__chipNoUser,
  "no-character": styles.session__chipNoCharacter,
  "integrity-violation": styles.session__chipIntegrity,
  "already-rewarded": styles.session__chipAlready,
};

const STATUS_CELL_CLASS: Record<SessionRespondentStatus, string> = {
  eligible: styles.session__statusEligible,
  "no-user": styles.session__statusNoUser,
  "no-character": styles.session__statusNoCharacter,
  "integrity-violation": styles.session__statusIntegrity,
  "already-rewarded": styles.session__statusAlready,
};

/* ── Props ── */

interface Props {
  initialCandidates: SessionRewardCandidate[];
}

/* ── 컴포넌트 ── */

export default function CreditSessionRewardPanel({ initialCandidates }: Props) {
  /* ── 필터 + 쿼리 ── */
  const [daysBack, setDaysBack] = useState<number>(DEFAULT_DAYS_BACK);

  // initialCandidates 는 daysBack=14 기준. 다른 값으로 변경 시 useQuery 가
  // 별도 캐시 키로 fetch — initialData 는 14 일 때만 hit.
  const { data, isLoading, isFetching, isError, error, refetch } =
    useCreditSessionCandidates(daysBack, {
      initialData:
        daysBack === DEFAULT_DAYS_BACK
          ? { candidates: initialCandidates }
          : undefined,
    });

  const candidates = data?.candidates ?? [];

  /* ── 카드 펼침 / 발급 폼 / 결과 ── */
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  );
  const [formSessionId, setFormSessionId] = useState<string | null>(null);
  const [amount, setAmount] = useState<string>(String(DEFAULT_AMOUNT));
  const [description, setDescription] = useState<string>("");
  const [pendingConfirm, setPendingConfirm] = useState(false);
  const [formError, setFormError] = useState<string>("");
  const [result, setResult] = useState<BulkGrantResult | null>(null);
  const [resultSessionTitle, setResultSessionTitle] = useState<string>("");

  const sessionRewardMutation = useSessionRewardMutation();

  /* ── 카드 토글 ── */
  function toggleCard(sessionId: string) {
    setSelectedSessionId((prev) => (prev === sessionId ? null : sessionId));
  }

  /* ── 발급 폼 열기 ── */
  function openForm(candidate: SessionRewardCandidate) {
    setFormSessionId(candidate.sessionId);
    setAmount(String(DEFAULT_AMOUNT));
    setDescription("");
    setPendingConfirm(false);
    setFormError("");
    // 펼침도 강제로.
    setSelectedSessionId(candidate.sessionId);
  }

  /* ── 발급 폼 닫기 ── */
  function closeForm() {
    setFormSessionId(null);
    setPendingConfirm(false);
    setFormError("");
  }

  /* ── description blur 시 자동 채움 ── */
  function handleDescriptionBlur(candidate: SessionRewardCandidate) {
    if (description.trim().length === 0) {
      setDescription(`세션 자동 보상 — ${candidate.sessionTitle}`);
    }
  }

  /* ── 검증 + 제출 ── */
  function handleSubmit(
    e: React.FormEvent,
    candidate: SessionRewardCandidate,
  ) {
    e.preventDefault();
    setFormError("");

    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      setFormError("금액은 0보다 큰 숫자여야 합니다.");
      setPendingConfirm(false);
      return;
    }

    if (!pendingConfirm) {
      setPendingConfirm(true);
      return;
    }

    runMutation(candidate, numAmount);
  }

  function runMutation(candidate: SessionRewardCandidate, numAmount: number) {
    const finalDescription =
      description.trim().length > 0
        ? description
        : `세션 자동 보상 — ${candidate.sessionTitle}`;

    sessionRewardMutation.mutate(
      {
        sessionId: candidate.sessionId,
        amount: numAmount,
        description: finalDescription,
      },
      {
        onSuccess: (res) => {
          setResult(res);
          setResultSessionTitle(candidate.sessionTitle);
          setFormSessionId(null);
          setPendingConfirm(false);
        },
        onError: (err) => {
          setFormError(err.message);
          setPendingConfirm(false);
        },
      },
    );
  }

  function closeResult() {
    setResult(null);
    setResultSessionTitle("");
  }

  /* ── 쿼리 에러 화면 ── */
  if (isError) {
    return (
      <Box>
        <PanelTitle>SESSION REWARD</PanelTitle>
        <div className={styles.session__queryError}>
          <span>
            세션 후보 조회에 실패했습니다.
            {error instanceof Error ? ` (${error.message})` : ""}
          </span>
          <Button type="button" size="sm" onClick={() => refetch()}>
            재시도
          </Button>
        </div>
      </Box>
    );
  }

  /* ── 결과 화면 (모달 대신 패널 내 교체) ── */
  if (result) {
    return (
      <Box>
        <PanelTitle
          right={
            <span className={styles.session__rewardSummary}>
              {resultSessionTitle}
            </span>
          }
        >
          SESSION REWARD · 결과
        </PanelTitle>

        <div className={styles.session__resultsLayout}>
          <div className={styles.session__resultsHeader}>
            <div className={styles.session__statRow}>
              <div className={styles.session__statBlock}>
                <span
                  className={`${styles.session__statBig} ${styles.session__statSucceeded}`}
                >
                  {result.succeeded}
                </span>
                <span className={styles.session__statLabel}>성공</span>
              </div>
              <div className={styles.session__statBlock}>
                <span
                  className={`${styles.session__statBig} ${styles.session__statFailed}`}
                >
                  {result.failed}
                </span>
                <span className={styles.session__statLabel}>실패</span>
              </div>
              <div className={styles.session__statBlock}>
                <span
                  className={`${styles.session__statBig} ${styles.session__statSkipped}`}
                >
                  {result.skipped}
                </span>
                <span className={styles.session__statLabel}>건너뜀</span>
              </div>
            </div>

            <Button type="button" variant="primary" onClick={closeResult}>
              닫기
            </Button>
          </div>

          <ResultsTable rows={result.results} />
        </div>
      </Box>
    );
  }

  /* ── 메인 화면 ── */
  return (
    <Box>
      <PanelTitle
        right={
          isFetching ? (
            <span className={styles.session__filterMeta}>갱신 중...</span>
          ) : null
        }
      >
        SESSION REWARD
      </PanelTitle>

      <div className={styles.session__layout}>
        {/* daysBack 셀렉터 */}
        <div className={styles.session__filterRow}>
          <label className={styles.session__filterLabel}>
            <span>WINDOW</span>
            <Select
              value={String(daysBack)}
              onChange={(e) => {
                setDaysBack(Number(e.target.value));
                // 폼/펼침 상태 reset (다른 세션 리스트로 전환).
                setSelectedSessionId(null);
                setFormSessionId(null);
                setPendingConfirm(false);
                setFormError("");
              }}
            >
              {DAYS_BACK_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  최근 {d}일
                </option>
              ))}
            </Select>
          </label>
          <span className={styles.session__filterMeta}>
            {candidates.length}건
          </span>
        </div>

        {/* 카드 리스트 / 빈 상태 / 로딩 */}
        {isLoading && candidates.length === 0 ? (
          <div className={styles.session__loading}>로딩 중...</div>
        ) : candidates.length === 0 ? (
          <div className={styles.session__emptyState}>
            최근 {daysBack}일 내 종료된 세션이 없습니다.
          </div>
        ) : (
          <div className={styles.session__cardList}>
            {candidates.map((candidate) => {
              const isOpen = selectedSessionId === candidate.sessionId;
              const isFormOpen = formSessionId === candidate.sessionId;
              const eligibleCount = candidate.counts.eligible;
              const alreadyCount = candidate.counts["already-rewarded"];
              const cardClass = isOpen
                ? `${styles.session__card} ${styles.session__cardActive}`
                : styles.session__card;

              return (
                <div key={candidate.sessionId} className={cardClass}>
                  {/* 헤더 */}
                  <div className={styles.session__cardHeader}>
                    <div
                      className={`${styles.session__cardHeaderLeft} ${styles.session__cardHeaderClickable}`}
                      onClick={() => toggleCard(candidate.sessionId)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleCard(candidate.sessionId);
                        }
                      }}
                    >
                      <span className={styles.session__title}>
                        {candidate.sessionTitle}
                      </span>
                      <span className={styles.session__date}>
                        {formatDate(candidate.sessionDate, "padded")}
                      </span>
                      {alreadyCount > 0 ? (
                        <span className={styles.session__alreadyBadge}>
                          ✓ 이미 발급됨
                        </span>
                      ) : null}
                    </div>

                    <div className={styles.session__cardActions}>
                      <Button
                        type="button"
                        size="sm"
                        variant="primary"
                        disabled={
                          eligibleCount === 0 || sessionRewardMutation.isPending
                        }
                        onClick={() => openForm(candidate)}
                      >
                        {eligibleCount === 0
                          ? "지급 대상 없음"
                          : `보상 발급 (${eligibleCount}명)`}
                      </Button>
                    </div>
                  </div>

                  {/* 카운트 칩 */}
                  <div className={styles.session__statusChips}>
                    {(
                      [
                        "eligible",
                        "already-rewarded",
                        "no-user",
                        "no-character",
                        "integrity-violation",
                      ] as const
                    ).map((key) => {
                      const count = candidate.counts[key];
                      if (count === 0) return null;
                      return (
                        <span
                          key={key}
                          className={`${styles.session__chip} ${CHIP_CLASS[key]}`}
                        >
                          {STATUS_LABEL[key]} {count}
                        </span>
                      );
                    })}
                  </div>

                  {/* 응답자 상세 */}
                  {isOpen ? (
                    <RespondentTable respondents={candidate.respondents} />
                  ) : null}

                  {/* 인라인 발급 폼 */}
                  {isFormOpen ? (
                    <form
                      className={styles.session__rewardForm}
                      onSubmit={(e) => handleSubmit(e, candidate)}
                    >
                      <div className={styles.session__rewardFormHeader}>
                        <span className={styles.session__rewardFormHeading}>
                          자동 보상 발급
                        </span>
                        <span className={styles.session__rewardSummary}>
                          지급 가능 {eligibleCount}명
                          {alreadyCount > 0
                            ? ` · 이미 발급됨 ${alreadyCount}명 (자동 스킵)`
                            : ""}
                        </span>
                      </div>

                      <div className={styles.session__rewardFields}>
                        <label className={styles.session__field}>
                          <Eyebrow>금액</Eyebrow>
                          <Input
                            type="number"
                            value={amount}
                            min="1"
                            required
                            onChange={(e) => {
                              setAmount(e.target.value);
                              setFormError("");
                              setPendingConfirm(false);
                            }}
                          />
                        </label>

                        <label className={styles.session__field}>
                          <Eyebrow>설명</Eyebrow>
                          <Input
                            type="text"
                            value={description}
                            placeholder={`세션 자동 보상 — ${candidate.sessionTitle}`}
                            onChange={(e) => {
                              setDescription(e.target.value);
                              setFormError("");
                              setPendingConfirm(false);
                            }}
                            onBlur={() => handleDescriptionBlur(candidate)}
                          />
                        </label>
                      </div>

                      {formError ? (
                        <div className={styles.session__error}>{formError}</div>
                      ) : null}

                      {pendingConfirm ? (
                        <div className={styles.session__confirm}>
                          <span>
                            정말 발급하시겠습니까? {eligibleCount}명 ×{" "}
                            {Math.abs(Number(amount) || 0).toLocaleString()} CR
                          </span>
                          <span className={styles.session__confirmActions}>
                            <Button
                              type="button"
                              onClick={() => setPendingConfirm(false)}
                            >
                              취소
                            </Button>
                            <Button
                              type="submit"
                              variant="primary"
                              disabled={sessionRewardMutation.isPending}
                            >
                              {sessionRewardMutation.isPending
                                ? "처리 중..."
                                : "확인 발급"}
                            </Button>
                          </span>
                        </div>
                      ) : (
                        <div className={styles.session__rewardActions}>
                          <Button type="button" onClick={closeForm}>
                            취소
                          </Button>
                          <Button
                            type="submit"
                            variant="primary"
                            disabled={
                              sessionRewardMutation.isPending ||
                              eligibleCount === 0
                            }
                          >
                            {sessionRewardMutation.isPending
                              ? "처리 중..."
                              : "발급"}
                          </Button>
                        </div>
                      )}
                    </form>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Box>
  );
}

/* ─────────────────────────────────────────────────────────────── *
 * 응답자 상세 테이블 (펼침)
 * ─────────────────────────────────────────────────────────────── */

interface RespondentTableProps {
  respondents: SessionRespondent[];
}

function RespondentTable({ respondents }: RespondentTableProps) {
  if (respondents.length === 0) {
    return (
      <div className={styles.session__respondentWrap}>
        <div className={styles.session__emptyState}>
          YES 응답자가 없습니다.
        </div>
      </div>
    );
  }

  return (
    <div className={styles.session__respondentWrap}>
      <table className={styles.session__respondentTable}>
        <thead>
          <tr>
            <th>상태</th>
            <th>코드네임</th>
            <th>표시명</th>
            <th>Discord ID</th>
            <th>사유</th>
          </tr>
        </thead>
        <tbody>
          {respondents.map((r) => (
            <tr key={`${r.discordId}-${r.status}`}>
              <td
                className={`${styles.session__statusCell} ${STATUS_CELL_CLASS[r.status]}`}
              >
                {STATUS_LABEL[r.status]}
              </td>
              <td>
                {r.characterCodename ? (
                  <span className={styles.session__codename}>
                    {r.characterCodename}
                  </span>
                ) : (
                  <span className={styles.session__codenameEmpty}>—</span>
                )}
              </td>
              <td>{r.displayName}</td>
              <td>
                <span className={styles.session__discordId}>{r.discordId}</span>
              </td>
              <td>
                <span className={styles.session__reason}>{r.reason ?? "—"}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── *
 * 결과 테이블
 * ─────────────────────────────────────────────────────────────── */

interface ResultsTableProps {
  rows: BulkGrantResultItem[];
}

function ResultsTable({ rows }: ResultsTableProps) {
  if (rows.length === 0) {
    return (
      <div className={styles.session__resultsTableWrap}>
        <div className={styles.session__emptyState}>
          표시할 결과가 없습니다.
        </div>
      </div>
    );
  }

  return (
    <div className={styles.session__resultsTableWrap}>
      <table className={styles.session__resultsTable}>
        <thead>
          <tr>
            <th>결과</th>
            <th>코드네임</th>
            <th className={styles.session__numCol}>새 잔액</th>
            <th>거래 ID / 사유</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const cellClass = row.success
              ? styles.session__rowOk
              : row.skipped
                ? styles.session__rowSkip
                : styles.session__rowFail;
            const label = row.success ? "OK" : row.skipped ? "SKIP" : "FAIL";
            return (
              <tr key={`${row.characterId ?? row.ownerId ?? idx}-${idx}`}>
                <td className={cellClass}>{label}</td>
                <td>
                  {row.characterCodename ? (
                    <span className={styles.session__codename}>
                      {row.characterCodename}
                    </span>
                  ) : (
                    <span className={styles.session__txId}>
                      {row.characterId ?? row.ownerId ?? "—"}
                    </span>
                  )}
                </td>
                <td className={styles.session__numCol}>
                  {row.newBalance != null
                    ? row.newBalance.toLocaleString()
                    : "—"}
                </td>
                <td>
                  {row.success ? (
                    <span className={styles.session__txId}>
                      {row.transactionId ?? "—"}
                    </span>
                  ) : (
                    <>
                      {row.code ? (
                        <span className={styles.session__codeChip}>
                          {row.code}
                        </span>
                      ) : null}
                      {row.error ?? row.skipReason ?? "—"}
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
