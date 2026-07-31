"use client";

import { useEffect, useId, useRef, useState } from "react";

import { useUpdateShopLotteryAdminConfig } from "@/hooks/mutations/useShopMutation";
import {
  ShopApiError,
  type ShopLotteryAdminConfigResponse,
  useShopLotteryAdminConfig,
} from "@/hooks/queries/useShopQuery";

import ShopLotteryEventPreviewModal from "./ShopLotteryEventPreviewModal";
import styles from "./ShopLotteryAdminModal.module.css";

interface Props {
  onClose: () => void;
}

interface LotteryAdminForm {
  enabled: boolean;
  eventId: string;
  startAtKst: string;
  endAtKst: string;
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function isoToKstInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 16);
}

function kstInputToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00+09:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export default function ShopLotteryAdminModal({ onClose }: Props) {
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const configQuery = useShopLotteryAdminConfig({ enabled: true });
  const updateMutation = useUpdateShopLotteryAdminConfig();
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const config = configQuery.data;
  const busy = updateMutation.isPending;

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy && !previewOpen) onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [busy, onClose, previewOpen]);

  async function refreshAfterConflict() {
    setConflictError(
      "다른 GM이 설정을 먼저 변경했습니다. 최신 값을 불러왔으니 다시 확인해 주세요.",
    );
    await configQuery.refetch();
  }

  return (
    <div className={styles.overlay}>
      <section
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className={styles.header}>
          <div>
            <span>GM EVENT CONTROL</span>
            <h2 id={titleId}>미스터비스트 복권 이벤트</h2>
            <p>저장 즉시 서버 설정에 반영되며 재배포가 필요하지 않습니다.</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            disabled={busy}
            aria-label="복권 이벤트 설정 닫기"
          >
            ×
          </button>
        </header>

        {configQuery.isPending ? (
          <div className={styles.loading}>이벤트 설정을 불러오는 중...</div>
        ) : !config ? (
          <div className={styles.loadError} role="alert">
            <p>
              {configQuery.error?.message ??
                "이벤트 설정을 불러오지 못했습니다."}
            </p>
            <button type="button" onClick={() => void configQuery.refetch()}>
              다시 불러오기
            </button>
          </div>
        ) : (
          <LotteryAdminFormBody
            key={config.version}
            config={config}
            conflictError={conflictError}
            onClearConflict={() => setConflictError(null)}
            onConflict={refreshAfterConflict}
            onClose={onClose}
            onPreview={() => setPreviewOpen(true)}
            onRefreshReadiness={() => void configQuery.refetch()}
            refreshingReadiness={configQuery.isFetching}
            updateMutation={updateMutation}
          />
        )}
      </section>
      {previewOpen ? (
        <ShopLotteryEventPreviewModal
          onClose={() => setPreviewOpen(false)}
        />
      ) : null}
    </div>
  );
}

interface LotteryAdminFormBodyProps {
  config: ShopLotteryAdminConfigResponse;
  conflictError: string | null;
  onClearConflict: () => void;
  onConflict: () => Promise<void>;
  onClose: () => void;
  onPreview: () => void;
  onRefreshReadiness: () => void;
  refreshingReadiness: boolean;
  updateMutation: ReturnType<typeof useUpdateShopLotteryAdminConfig>;
}

function LotteryAdminFormBody({
  config,
  conflictError,
  onClearConflict,
  onConflict,
  onClose,
  onPreview,
  onRefreshReadiness,
  refreshingReadiness,
  updateMutation,
}: LotteryAdminFormBodyProps) {
  const [form, setForm] = useState<LotteryAdminForm>({
    enabled: config.enabled,
    eventId: config.eventId,
    startAtKst: isoToKstInput(config.startAt),
    endAtKst: isoToKstInput(config.endAt),
  });
  const [formError, setFormError] = useState<string | null>(null);
  const busy = updateMutation.isPending;
  const stateLabel = config.active
    ? "진행 중"
    : config.enabled
      ? "기간 외"
      : "비활성";

  function updateForm(next: Partial<LotteryAdminForm>) {
    setForm((prev) => ({ ...prev, ...next }));
    setFormError(null);
    onClearConflict();
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    onClearConflict();

    const startAt = kstInputToIso(form.startAtKst);
    const endAt = kstInputToIso(form.endAtKst);
    if (!startAt || !endAt) {
      setFormError("시작·종료 시각을 모두 입력해 주세요.");
      return;
    }
    if (new Date(startAt).getTime() >= new Date(endAt).getTime()) {
      setFormError("종료 시각은 시작 시각보다 늦어야 합니다.");
      return;
    }
    if (!form.eventId.trim()) {
      setFormError("이벤트 ID를 입력해 주세요.");
      return;
    }
    if (form.enabled && !config.readiness.ready) {
      setFormError("필수 준비 항목을 해결한 뒤 이벤트를 활성화할 수 있습니다.");
      return;
    }

    try {
      await updateMutation.mutateAsync({
        enabled: form.enabled,
        eventId: form.eventId.trim(),
        startAt,
        endAt,
        expectedVersion: config.version,
      });
      onClose();
    } catch (error) {
      if (error instanceof ShopApiError && error.status === 409) {
        await onConflict();
      }
    }
  }

  const requestError =
    formError ?? conflictError ?? updateMutation.error?.message ?? null;

  return (
    <form className={styles.body} onSubmit={handleSubmit}>
      <section className={styles.statusPanel} aria-label="이벤트 상태">
        <div>
          <span>현재 상태</span>
          <strong
            className={
              config.active ? styles.statusActive : styles.statusInactive
            }
          >
            {stateLabel}
          </strong>
        </div>
        <div>
          <span>설정 버전</span>
          <strong>v{config.version}</strong>
        </div>
        <div>
          <span>최근 변경</span>
          <strong>{config.updatedByName ?? "기록 없음"}</strong>
        </div>
      </section>

      <label className={styles.toggleRow}>
        <span>
          <strong>이벤트 활성화</strong>
          <small>
            설정 기간 안에서 소다 구매 시 복권을 지급하고 포스터를 노출합니다.
          </small>
        </span>
        <input
          type="checkbox"
          checked={form.enabled}
          onChange={(event) => updateForm({ enabled: event.target.checked })}
        />
      </label>

      <div className={styles.fieldGrid}>
        <label className={styles.field}>
          <span>이벤트 ID</span>
          <input
            value={form.eventId}
            onChange={(event) => updateForm({ eventId: event.target.value })}
            placeholder="mrbeast-lottery-2026-01"
            autoComplete="off"
          />
          <small>소문자 영문·숫자·하이픈·밑줄로 구분합니다.</small>
        </label>
        <label className={styles.field}>
          <span>시작 시각 · KST</span>
          <input
            type="datetime-local"
            value={form.startAtKst}
            onChange={(event) => updateForm({ startAtKst: event.target.value })}
          />
        </label>
        <label className={styles.field}>
          <span>종료 시각 · KST</span>
          <input
            type="datetime-local"
            value={form.endAtKst}
            onChange={(event) => updateForm({ endAtKst: event.target.value })}
          />
        </label>
      </div>

      <section className={styles.readiness} aria-label="이벤트 준비 상태">
        <div className={styles.readiness__header}>
          <strong>활성화 준비 상태</strong>
          <span className={config.readiness.ready ? styles.ready : styles.notReady}>
            {config.readiness.ready ? "READY" : "NOT READY"}
          </span>
        </div>
        <div className={styles.readiness__checks}>
          <span>
            중복 지급·사용 방지 DB 인덱스 5개{" "}
            <strong>
              {config.readiness.indexesReady ? "정상" : "확인 필요"}
            </strong>
          </span>
          <span>
            인벤토리 표시용 비공개 복권 아이템{" "}
            <strong>
              {config.readiness.masterItemReady ? "정상" : "확인 필요"}
            </strong>
          </span>
        </div>
        <p className={styles.readiness__description}>
          두 항목은 중복 당첨과 잘못된 아이템 판매를 막는 안전장치입니다.
          미리보기에는 필요하지 않으며 실제 이벤트 활성화에만 필요합니다.
        </p>
        {config.readiness.issues.length ? (
          <ul>
            {config.readiness.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        ) : null}
        <button
          type="button"
          className={styles.readinessRefreshBtn}
          onClick={onRefreshReadiness}
          disabled={refreshingReadiness}
        >
          {refreshingReadiness ? "준비 상태 확인 중..." : "준비 상태 다시 확인"}
        </button>
      </section>

      {requestError ? (
        <div className={styles.error} role="alert">
          {requestError}
        </div>
      ) : null}

      <footer className={styles.footer}>
        <button
          type="button"
          className={styles.previewBtn}
          onClick={onPreview}
          disabled={busy}
        >
          이벤트 화면 미리보기
        </button>
        <span className={styles.footer__spacer} />
        <button type="button" onClick={onClose} disabled={busy}>취소</button>
        <button type="submit" className={styles.saveBtn} disabled={busy}>
          {busy ? "저장 중..." : "이벤트 설정 저장"}
        </button>
      </footer>
    </form>
  );
}
