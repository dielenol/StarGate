"use client";

import { useMemo, useState } from "react";

import type {
  BulkGrantResult,
  BulkGrantResultItem,
  SessionRespondent,
  SessionRespondentStatus,
  SessionRewardCandidate,
  SessionRewardLineInput,
  SessionRewardLineKind,
  SessionRewardStatField,
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
import { STOCK_CATALOG } from "@/lib/stocks/catalog";

import type { GrantTargetUser } from "./CreditBulkGrantForm";
import styles from "./CreditSessionRewardPanel.module.css";

const DAYS_BACK_OPTIONS = [7, 14, 30, 60] as const;
const DEFAULT_DAYS_BACK = 14;

const REWARD_KIND_OPTIONS: { value: SessionRewardLineKind; label: string }[] = [
  { value: "CREDIT", label: "크레딧" },
  { value: "POINT", label: "포인트" },
  { value: "STAT", label: "능력치" },
  { value: "STOCK", label: "주식" },
];

const STAT_OPTIONS: { value: SessionRewardStatField; label: string }[] = [
  { value: "hp", label: "HP" },
  { value: "san", label: "SAN" },
  { value: "def", label: "DEF" },
  { value: "atk", label: "ATK" },
];

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

interface Props {
  initialCandidates: SessionRewardCandidate[];
  grantTargets: GrantTargetUser[];
}

interface FormParticipant {
  ownerId: string;
  characterId: string;
  characterCodename: string;
  displayName: string;
}

interface RewardDraft {
  id: string;
  kind: SessionRewardLineKind;
  amount: string;
  statField: SessionRewardStatField;
  stockTicker: string;
  targetCharacterId: string;
}

function makeRewardDraft(kind: SessionRewardLineKind = "CREDIT"): RewardDraft {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    kind,
    amount: kind === "CREDIT" ? "40" : "1",
    statField: "san",
    stockTicker: STOCK_CATALOG[0]?.ticker ?? "",
    targetCharacterId: "",
  };
}

function defaultDescription(candidate: SessionRewardCandidate): string {
  return `세션 복합 보상 — ${candidate.sessionTitle}`;
}

export default function CreditSessionRewardPanel({
  initialCandidates,
  grantTargets,
}: Props) {
  const [daysBack, setDaysBack] = useState<number>(DEFAULT_DAYS_BACK);

  const { data, isLoading, isFetching, isError, error, refetch } =
    useCreditSessionCandidates(daysBack, {
      initialData:
        daysBack === DEFAULT_DAYS_BACK
          ? { candidates: initialCandidates }
          : undefined,
    });

  const candidates = data?.candidates ?? [];

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  );
  const [formSessionId, setFormSessionId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<FormParticipant[]>([]);
  const [pendingAddOwnerId, setPendingAddOwnerId] = useState("");
  const [rewards, setRewards] = useState<RewardDraft[]>([
    makeRewardDraft("CREDIT"),
  ]);
  const [description, setDescription] = useState("");
  const [pendingConfirm, setPendingConfirm] = useState(false);
  const [formError, setFormError] = useState("");
  const [result, setResult] = useState<BulkGrantResult | null>(null);
  const [resultSessionTitle, setResultSessionTitle] = useState("");

  const sessionRewardMutation = useSessionRewardMutation();

  const addableTargets = useMemo(() => {
    const selected = new Set(participants.map((p) => p.characterId));
    return grantTargets.filter(
      (target) =>
        target.mainCharacterId !== null && !selected.has(target.mainCharacterId),
    );
  }, [grantTargets, participants]);

  function toggleCard(sessionId: string) {
    setSelectedSessionId((prev) => (prev === sessionId ? null : sessionId));
  }

  function openForm(candidate: SessionRewardCandidate) {
    const initialParticipants = candidate.respondents
      .filter(
        (r) =>
          r.status === "eligible" &&
          r.ownerId !== null &&
          r.characterId !== null &&
          r.characterCodename !== null,
      )
      .map<FormParticipant>((r) => ({
        ownerId: r.ownerId!,
        characterId: r.characterId!,
        characterCodename: r.characterCodename!,
        displayName: r.displayName,
      }));

    setParticipants(initialParticipants);
    setRewards([makeRewardDraft("CREDIT")]);
    setDescription(defaultDescription(candidate));
    setFormSessionId(candidate.sessionId);
    setSelectedSessionId(candidate.sessionId);
    setPendingAddOwnerId("");
    setPendingConfirm(false);
    setFormError("");
  }

  function closeForm() {
    setFormSessionId(null);
    setPendingConfirm(false);
    setFormError("");
  }

  function addParticipant() {
    const target = grantTargets.find((t) => t.userId === pendingAddOwnerId);
    if (!target?.mainCharacterId || !target.mainCharacterCodename) return;
    setParticipants((prev) => [
      ...prev,
      {
        ownerId: target.userId,
        characterId: target.mainCharacterId!,
        characterCodename: target.mainCharacterCodename!,
        displayName: target.displayName,
      },
    ]);
    setPendingAddOwnerId("");
    setPendingConfirm(false);
    setFormError("");
  }

  function removeParticipant(characterId: string) {
    setParticipants((prev) => prev.filter((p) => p.characterId !== characterId));
    setRewards((prev) =>
      prev.map((reward) =>
        reward.targetCharacterId === characterId
          ? { ...reward, targetCharacterId: "" }
          : reward,
      ),
    );
    setPendingConfirm(false);
  }

  function updateReward(id: string, patch: Partial<RewardDraft>) {
    setRewards((prev) =>
      prev.map((reward) => {
        if (reward.id !== id) return reward;
        const next = { ...reward, ...patch };
        if (patch.kind) {
          next.amount = patch.kind === "CREDIT" ? "40" : "1";
        }
        return next;
      }),
    );
    setPendingConfirm(false);
    setFormError("");
  }

  function addReward(kind: SessionRewardLineKind = "CREDIT") {
    setRewards((prev) => [...prev, makeRewardDraft(kind)]);
    setPendingConfirm(false);
  }

  function removeReward(id: string) {
    setRewards((prev) => prev.filter((reward) => reward.id !== id));
    setPendingConfirm(false);
  }

  function buildPayloadRewards(): SessionRewardLineInput[] {
    return rewards.map((reward) => ({
      kind: reward.kind,
      amount: Number(reward.amount),
      statField: reward.kind === "STAT" ? reward.statField : undefined,
      stockTicker: reward.kind === "STOCK" ? reward.stockTicker : undefined,
      targetCharacterId: reward.targetCharacterId || null,
    }));
  }

  function validateForm(): string | null {
    if (participants.length === 0) return "참여자를 1명 이상 선택하세요.";
    if (rewards.length === 0) return "보상 항목을 1개 이상 추가하세요.";
    for (const reward of rewards) {
      const amount = Number(reward.amount);
      if (!Number.isFinite(amount) || amount === 0) {
        return "보상 수치가 올바르지 않습니다.";
      }
      if (reward.kind !== "STAT" && amount <= 0) {
        return "크레딧/포인트/주식 보상은 0보다 커야 합니다.";
      }
      if (reward.kind !== "CREDIT" && !Number.isInteger(amount)) {
        return "포인트/능력치/주식 보상은 정수여야 합니다.";
      }
      if (reward.kind === "STOCK" && !reward.stockTicker) {
        return "주식 보상에는 종목 선택이 필요합니다.";
      }
    }
    if (description.trim().length === 0) return "설명을 입력하세요.";
    return null;
  }

  function handleSubmit(
    event: React.FormEvent,
    candidate: SessionRewardCandidate,
  ) {
    event.preventDefault();
    setFormError("");

    const validationError = validateForm();
    if (validationError) {
      setFormError(validationError);
      setPendingConfirm(false);
      return;
    }

    if (!pendingConfirm) {
      setPendingConfirm(true);
      return;
    }

    sessionRewardMutation.mutate(
      {
        sessionId: candidate.sessionId,
        description: description.trim(),
        participants: participants.map((p) => ({
          ownerId: p.ownerId,
          characterId: p.characterId,
        })),
        rewards: buildPayloadRewards(),
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
              <ResultStat label="성공" value={result.succeeded} tone="ok" />
              <ResultStat label="실패" value={result.failed} tone="fail" />
              <ResultStat label="건너뜀" value={result.skipped} tone="skip" />
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
        <div className={styles.session__filterRow}>
          <label className={styles.session__filterLabel}>
            <span>WINDOW</span>
            <Select
              value={String(daysBack)}
              onChange={(e) => {
                setDaysBack(Number(e.target.value));
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
                          일부 보상 이력 {alreadyCount}명
                        </span>
                      ) : null}
                    </div>

                    <div className={styles.session__cardActions}>
                      <Button
                        type="button"
                        size="sm"
                        variant="primary"
                        disabled={sessionRewardMutation.isPending}
                        onClick={() => openForm(candidate)}
                      >
                        보상 발급 ({eligibleCount}명)
                      </Button>
                    </div>
                  </div>

                  <StatusChips counts={candidate.counts} />

                  {isOpen ? (
                    <RespondentTable respondents={candidate.respondents} />
                  ) : null}

                  {isFormOpen ? (
                    <form
                      className={styles.session__rewardForm}
                      onSubmit={(e) => handleSubmit(e, candidate)}
                    >
                      <div className={styles.session__rewardFormHeader}>
                        <span className={styles.session__rewardFormHeading}>
                          복합 보상 발급
                        </span>
                        <span className={styles.session__rewardSummary}>
                          참여자 {participants.length}명 · 보상 {rewards.length}개
                        </span>
                      </div>

                      <ParticipantEditor
                        participants={participants}
                        addableTargets={addableTargets}
                        pendingAddOwnerId={pendingAddOwnerId}
                        onPendingAddOwnerIdChange={setPendingAddOwnerId}
                        onAdd={addParticipant}
                        onRemove={removeParticipant}
                      />

                      <RewardEditor
                        rewards={rewards}
                        participants={participants}
                        onAdd={addReward}
                        onRemove={removeReward}
                        onUpdate={updateReward}
                      />

                      <label className={styles.session__field}>
                        <Eyebrow>설명</Eyebrow>
                        <Input
                          type="text"
                          value={description}
                          onChange={(e) => {
                            setDescription(e.target.value);
                            setFormError("");
                            setPendingConfirm(false);
                          }}
                          placeholder={defaultDescription(candidate)}
                        />
                      </label>

                      {formError ? (
                        <div className={styles.session__error}>{formError}</div>
                      ) : null}

                      {pendingConfirm ? (
                        <div className={styles.session__confirm}>
                          <span>
                            {participants.length}명에게 보상 {rewards.length}개를
                            발급합니다.
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
                            disabled={sessionRewardMutation.isPending}
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

function StatusChips({
  counts,
}: {
  counts: Record<SessionRespondentStatus, number>;
}) {
  return (
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
        const count = counts[key];
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
  );
}

function ParticipantEditor({
  participants,
  addableTargets,
  pendingAddOwnerId,
  onPendingAddOwnerIdChange,
  onAdd,
  onRemove,
}: {
  participants: FormParticipant[];
  addableTargets: GrantTargetUser[];
  pendingAddOwnerId: string;
  onPendingAddOwnerIdChange: (value: string) => void;
  onAdd: () => void;
  onRemove: (characterId: string) => void;
}) {
  return (
    <div className={styles.session__editorBlock}>
      <div className={styles.session__editorHead}>
        <Eyebrow>참여자</Eyebrow>
        <span className={styles.session__rewardSummary}>
          투표 결과 기준으로 시작하고, 실제 참석 기준으로 추가/제거하세요.
        </span>
      </div>
      <div className={styles.session__participantList}>
        {participants.map((participant) => (
          <span className={styles.session__participantChip} key={participant.characterId}>
            <b>{participant.characterCodename}</b>
            <span>{participant.displayName}</span>
            <button
              type="button"
              onClick={() => onRemove(participant.characterId)}
              aria-label={`${participant.characterCodename} 제거`}
            >
              ×
            </button>
          </span>
        ))}
        {participants.length === 0 ? (
          <span className={styles.session__fieldHint}>선택된 참여자가 없습니다.</span>
        ) : null}
      </div>
      <div className={styles.session__addRow}>
        <Select
          className={styles.session__select}
          value={pendingAddOwnerId}
          onChange={(e) => onPendingAddOwnerIdChange(e.target.value)}
        >
          <option value="">참여자 추가 선택</option>
          {addableTargets.map((target) => (
            <option key={target.userId} value={target.userId}>
              {target.mainCharacterCodename} · {target.displayName}
            </option>
          ))}
        </Select>
        <Button
          type="button"
          size="sm"
          className={styles.session__participantAddButton}
          onClick={onAdd}
          disabled={!pendingAddOwnerId}
        >
          추가
        </Button>
      </div>
    </div>
  );
}

function RewardEditor({
  rewards,
  participants,
  onAdd,
  onRemove,
  onUpdate,
}: {
  rewards: RewardDraft[];
  participants: FormParticipant[];
  onAdd: (kind?: SessionRewardLineKind) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<RewardDraft>) => void;
}) {
  return (
    <div className={styles.session__editorBlock}>
      <div className={styles.session__editorHead}>
        <Eyebrow>보상 항목</Eyebrow>
        <Button
          type="button"
          size="sm"
          className={styles.session__rewardAddButton}
          onClick={() => onAdd()}
        >
          항목 추가
        </Button>
      </div>
      <div className={styles.session__rewardLineList}>
        {rewards.map((reward) => (
          <div className={styles.session__rewardLine} key={reward.id}>
            <label className={styles.session__field}>
              <Eyebrow>종류</Eyebrow>
              <Select
                className={styles.session__select}
                value={reward.kind}
                onChange={(e) =>
                  onUpdate(reward.id, {
                    kind: e.target.value as SessionRewardLineKind,
                  })
                }
              >
                {REWARD_KIND_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </label>

            {reward.kind === "STAT" ? (
              <label className={styles.session__field}>
                <Eyebrow>능력치</Eyebrow>
                <Select
                  className={styles.session__select}
                  value={reward.statField}
                  onChange={(e) =>
                    onUpdate(reward.id, {
                      statField: e.target.value as SessionRewardStatField,
                    })
                  }
                >
                  {STAT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </label>
            ) : reward.kind === "STOCK" ? (
              <label className={styles.session__field}>
                <Eyebrow>종목</Eyebrow>
                <Select
                  className={styles.session__select}
                  value={reward.stockTicker}
                  onChange={(e) =>
                    onUpdate(reward.id, {
                      stockTicker: e.target.value,
                    })
                  }
                >
                  {STOCK_CATALOG.map((stock) => (
                    <option key={stock.ticker} value={stock.ticker}>
                      {stock.ticker} · {stock.name}
                    </option>
                  ))}
                </Select>
              </label>
            ) : (
              <div
                className={styles.session__rewardStatPlaceholder}
                aria-hidden="true"
              />
            )}

            <label className={styles.session__field}>
              <Eyebrow>수치</Eyebrow>
              <Input
                type="number"
                value={reward.amount}
                step="1"
                min={reward.kind === "STAT" ? undefined : "1"}
                onChange={(e) => onUpdate(reward.id, { amount: e.target.value })}
              />
            </label>

            <label className={styles.session__field}>
              <Eyebrow>대상</Eyebrow>
              <Select
                className={styles.session__select}
                value={reward.targetCharacterId}
                onChange={(e) =>
                  onUpdate(reward.id, { targetCharacterId: e.target.value })
                }
              >
                <option value="">전체 참여자</option>
                {participants.map((participant) => (
                  <option
                    key={participant.characterId}
                    value={participant.characterId}
                  >
                    {participant.characterCodename}
                  </option>
                ))}
              </Select>
            </label>

            <Button
              type="button"
              size="sm"
              className={styles.session__rewardRemoveButton}
              onClick={() => onRemove(reward.id)}
              disabled={rewards.length === 1}
            >
              제거
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function RespondentTable({ respondents }: { respondents: SessionRespondent[] }) {
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

function ResultStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "ok" | "fail" | "skip";
}) {
  const toneClass =
    tone === "ok"
      ? styles.session__statSucceeded
      : tone === "fail"
        ? styles.session__statFailed
        : styles.session__statSkipped;

  return (
    <div className={styles.session__statBlock}>
      <span className={`${styles.session__statBig} ${toneClass}`}>{value}</span>
      <span className={styles.session__statLabel}>{label}</span>
    </div>
  );
}

function ResultsTable({ rows }: { rows: BulkGrantResultItem[] }) {
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
            <th>보상</th>
            <th className={styles.session__numCol}>처리 후</th>
            <th>기록 / 사유</th>
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
                <td>{row.rewardLabel ?? row.rewardKind ?? "—"}</td>
                <td className={styles.session__numCol}>
                  {formatResultBalance(row)}
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

function formatResultBalance(row: BulkGrantResultItem): string {
  if (row.newPointBalance != null) {
    return `${row.newPointBalance.toLocaleString()} PT`;
  }
  if (row.newBalance != null) {
    return `${row.newBalance.toLocaleString()} CR`;
  }
  if (row.newStatValue != null) {
    return `${row.statField?.toUpperCase() ?? "STAT"} ${row.newStatValue}`;
  }
  if (row.newStockShares != null) {
    return `${row.stockTicker ?? "STOCK"} ${row.newStockShares.toLocaleString()}주`;
  }
  return "—";
}
