"use client";

import Image from "next/image";
import { type FormEvent, useMemo, useState } from "react";

import Box from "@/components/ui/Box/Box";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import {
  useCancelEquipmentWorkshopRequest,
  useQuoteEquipmentWorkshopRequest,
  useUpdateEquipmentWorkshopRequest,
} from "@/hooks/mutations/useEquipmentShopMutation";
import {
  EquipmentShopApiError,
  type EquipmentWorkshopRequestsResponse,
  useEquipmentWorkshopRequests,
} from "@/hooks/queries/useEquipmentShopQuery";
import type {
  AdminSerializedEquipmentWorkshopRequest,
  EquipmentWorkshopRequestStatus,
} from "@/lib/equipment-shop/workshop-request";

import styles from "./page.module.css";

interface Props {
  initialRequests: EquipmentWorkshopRequestsResponse;
  items: Array<{ id: string; name: string; category: string }>;
  blobUploadEnabled: boolean;
}

interface QuoteDraft {
  expectedVersion: number;
  creditCost: string;
  durationMinutes: string;
  materials: Array<{ itemId: string; quantity: string }>;
  resultName: string;
  resultDescription: string;
  resultDamage: string;
  resultEffect: string;
  resultTags: string;
  resultPreviewImage: string;
  internalNote: string;
}

const STATUS_LABELS: Record<EquipmentWorkshopRequestStatus, string> = {
  REQUESTED: "접수",
  IN_REVIEW: "검토 중",
  APPROVED: "기존 승인",
  QUOTED: "견적 발행",
  IN_PROGRESS: "제작 중",
  DECLINED: "플레이어 거절",
  REJECTED: "운영 반려",
  CANCELLED: "제작 취소",
  COMPLETED: "수령 완료",
};

const QUOTABLE = new Set<EquipmentWorkshopRequestStatus>([
  "REQUESTED",
  "IN_REVIEW",
  "APPROVED",
  "QUOTED",
]);

function createDraft(request: AdminSerializedEquipmentWorkshopRequest): QuoteDraft {
  return {
    expectedVersion: request.quote?.version ?? 0,
    creditCost: String(request.quote?.creditCost ?? 0),
    durationMinutes: String(request.quote?.durationMinutes ?? 60),
    materials: request.quote?.materials.map((material) => ({
      itemId: material.itemId,
      quantity: String(material.quantity),
    })) ?? [],
    resultName: request.quote?.result.name ?? `${request.equipmentName ?? "장비"} · 개조형`,
    resultDescription: request.quote?.result.description ?? request.details,
    resultDamage: request.quote?.result.damage ?? request.sourceDamage ?? "",
    resultEffect: request.quote?.result.effect ?? "",
    resultTags: request.quote?.result.tags.join(", ") ?? "",
    resultPreviewImage: request.quote?.result.previewImage ?? request.sourcePreviewImage ?? "",
    internalNote: request.internalNote ?? "",
  };
}

function errorMessage(error: unknown): string {
  return error instanceof EquipmentShopApiError || error instanceof Error
    ? error.message
    : "공방 요청 처리에 실패했습니다.";
}

export default function EquipmentWorkshopAdminClient({
  initialRequests,
  items,
  blobUploadEnabled,
}: Props) {
  const requestsQuery = useEquipmentWorkshopRequests({
    viewerKey: "gm",
    initialData: initialRequests,
  });
  const requests = useMemo(
    () => (requestsQuery.data?.requests ?? []) as AdminSerializedEquipmentWorkshopRequest[],
    [requestsQuery.data?.requests],
  );
  const quoteMutation = useQuoteEquipmentWorkshopRequest();
  const cancelMutation = useCancelEquipmentWorkshopRequest();
  const statusMutation = useUpdateEquipmentWorkshopRequest();
  const [selectedId, setSelectedId] = useState(initialRequests.requests[0]?._id ?? "");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ACTIVE");
  const selected = requests.find((request) => request._id === selectedId) ?? requests[0];
  const [draft, setDraft] = useState<QuoteDraft>(() => selected ? createDraft(selected) : createDraft({} as AdminSerializedEquipmentWorkshopRequest));
  const [operatorNote, setOperatorNote] = useState("");
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [uploading, setUploading] = useState(false);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return requests.filter((request) => {
      const statusMatch = statusFilter === "ALL"
        || (statusFilter === "ACTIVE"
          ? ["REQUESTED", "IN_REVIEW", "APPROVED", "QUOTED", "IN_PROGRESS"].includes(request.status)
          : request.status === statusFilter);
      const textMatch = !needle || [request.characterCodename, request.equipmentName, request.userName, request.details]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
      return statusMatch && textMatch;
    });
  }, [requests, search, statusFilter]);

  if (!selected) return <Box>공방 요청이 없습니다.</Box>;

  const updateMaterial = (index: number, patch: Partial<QuoteDraft["materials"][number]>) => {
    setDraft((current) => ({
      ...current,
      materials: current.materials.map((material, materialIndex) =>
        materialIndex === index ? { ...material, ...patch } : material,
      ),
    }));
  };

  const selectRequest = (request: AdminSerializedEquipmentWorkshopRequest) => {
    setSelectedId(request._id);
    setDraft(createDraft(request));
    setOperatorNote("");
    setFeedback(null);
  };

  const submitQuote = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    quoteMutation.mutate(
      {
        requestId: selected._id,
        quote: {
          expectedVersion: draft.expectedVersion,
          creditCost: Number(draft.creditCost),
          durationMinutes: Number(draft.durationMinutes),
          materials: draft.materials.map((material) => ({
            itemId: material.itemId,
            quantity: Number(material.quantity),
          })),
          result: {
            name: draft.resultName,
            description: draft.resultDescription,
            ...(draft.resultDamage.trim() ? { damage: draft.resultDamage.trim() } : {}),
            ...(draft.resultEffect.trim() ? { effect: draft.resultEffect.trim() } : {}),
            tags: draft.resultTags.split(",").map((tag) => tag.trim()).filter(Boolean),
            ...(draft.resultPreviewImage.trim() ? { previewImage: draft.resultPreviewImage.trim() } : {}),
          },
          ...(draft.internalNote.trim() ? { internalNote: draft.internalNote.trim() } : {}),
        },
      },
      {
        onSuccess: ({ request }) => {
          setSelectedId(request._id);
          setDraft(createDraft(request));
          setFeedback({ tone: "success", text: `견적 v${request.quote?.version}을 발행했습니다.` });
        },
        onError: (error) => setFeedback({ tone: "error", text: errorMessage(error) }),
      },
    );
  };

  const uploadImage = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setFeedback(null);
    try {
      const body = new FormData();
      body.set("requestId", selected._id);
      body.set("file", file);
      const response = await fetch("/api/erp/admin/equipment-workshop/assets", { method: "POST", body });
      const result = await response.json() as { url?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error ?? "이미지 업로드에 실패했습니다.");
      setDraft((current) => ({ ...current, resultPreviewImage: result.url ?? "" }));
      setFeedback({ tone: "success", text: "결과 이미지를 업로드했습니다." });
    } catch (error) {
      setFeedback({ tone: "error", text: errorMessage(error) });
    } finally {
      setUploading(false);
    }
  };

  const updateStatus = (status: EquipmentWorkshopRequestStatus) => {
    statusMutation.mutate(
      { requestId: selected._id, status, ...(operatorNote.trim() ? { operatorNote: operatorNote.trim() } : {}) },
      {
        onSuccess: () => setFeedback({ tone: "success", text: `${STATUS_LABELS[status]} 상태로 변경했습니다.` }),
        onError: (error) => setFeedback({ tone: "error", text: errorMessage(error) }),
      },
    );
  };

  return (
    <div className={styles.root}>
      <Box className={styles.toolbar}>
        <label>
          <span>요청 검색</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="캐릭터·장비·사용자" />
        </label>
        <label>
          <span>상태</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="ACTIVE">진행 중 전체</option>
            <option value="ALL">전체</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </Box>

      <div className={styles.workspace}>
        <aside className={styles.requestList} aria-label="공방 요청 목록">
          {filtered.map((request) => (
            <button key={request._id} type="button" data-active={request._id === selected._id} onClick={() => selectRequest(request)}>
              <span>{STATUS_LABELS[request.status]}</span>
              <strong>{request.characterCodename}</strong>
              <small>{request.equipmentName ?? (request.kind === "custom" ? "커스텀 제작" : "장비 강화")}</small>
            </button>
          ))}
        </aside>

        <main className={styles.detail}>
          <Box className={styles.sourceCard}>
            <Eyebrow>SOURCE EQUIPMENT</Eyebrow>
            <div className={styles.sourceCard__content}>
              {selected.sourcePreviewImage ? (
                <span className={styles.preview}><Image src={selected.sourcePreviewImage} alt="" fill sizes="120px" unoptimized /></span>
              ) : null}
              <div>
                <strong>{selected.equipmentName ?? "커스텀 제작 요청"}</strong>
                <p>{selected.characterCodename} · {selected.sourceCategory ?? selected.kind} · {selected.sourceSlot ?? "슬롯 미지정"}</p>
                <p>{selected.sourceDamage ?? "피해 정보 없음"}</p>
                <blockquote>{selected.details}</blockquote>
              </div>
            </div>
          </Box>

          {selected.kind === "upgrade" && QUOTABLE.has(selected.status) ? (
            <form className={styles.quoteForm} onSubmit={submitQuote}>
              <Box>
                <Eyebrow>QUOTE v{selected.quote?.version ?? 0}</Eyebrow>
                <div className={styles.twoColumns}>
                  <label><span>크레딧</span><input type="number" min="0" step="0.01" required value={draft.creditCost} onChange={(event) => setDraft((current) => ({ ...current, creditCost: event.target.value }))} /></label>
                  <label><span>제작 시간(분)</span><input type="number" min="1" max="43200" step="1" required value={draft.durationMinutes} onChange={(event) => setDraft((current) => ({ ...current, durationMinutes: event.target.value }))} /></label>
                </div>
              </Box>
              <Box>
                <div className={styles.sectionTitle}><Eyebrow>MATERIALS</Eyebrow><button type="button" onClick={() => setDraft((current) => ({ ...current, materials: [...current.materials, { itemId: "", quantity: "1" }] }))}>재료 추가</button></div>
                <div className={styles.materialRows}>
                  {draft.materials.map((material, index) => (
                    <div key={`${index}:${material.itemId}`}>
                      <select required value={material.itemId} onChange={(event) => updateMaterial(index, { itemId: event.target.value })}>
                        <option value="">재료 선택</option>
                        {items.filter((item) => item.id !== selected.sourceItemId).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.category}</option>)}
                      </select>
                      <input type="number" min="1" max="999" step="1" required value={material.quantity} onChange={(event) => updateMaterial(index, { quantity: event.target.value })} />
                      <button type="button" aria-label="재료 제거" onClick={() => setDraft((current) => ({ ...current, materials: current.materials.filter((_, rowIndex) => rowIndex !== index) }))}>제거</button>
                    </div>
                  ))}
                </div>
              </Box>
              <Box className={styles.resultForm}>
                <Eyebrow>RESULT BLUEPRINT</Eyebrow>
                <label><span>결과 장비명</span><input required maxLength={80} value={draft.resultName} onChange={(event) => setDraft((current) => ({ ...current, resultName: event.target.value }))} /></label>
                <label><span>설명</span><textarea required maxLength={500} rows={4} value={draft.resultDescription} onChange={(event) => setDraft((current) => ({ ...current, resultDescription: event.target.value }))} /></label>
                <div className={styles.twoColumns}>
                  <label><span>피해</span><input maxLength={80} value={draft.resultDamage} onChange={(event) => setDraft((current) => ({ ...current, resultDamage: event.target.value }))} /></label>
                  <label><span>효과</span><input maxLength={120} value={draft.resultEffect} onChange={(event) => setDraft((current) => ({ ...current, resultEffect: event.target.value }))} /></label>
                </div>
                <label><span>태그(쉼표 구분)</span><input value={draft.resultTags} onChange={(event) => setDraft((current) => ({ ...current, resultTags: event.target.value }))} /></label>
                <label><span>결과 이미지 URL</span><input maxLength={500} value={draft.resultPreviewImage} onChange={(event) => setDraft((current) => ({ ...current, resultPreviewImage: event.target.value }))} placeholder="/assets/... 또는 https://..." /></label>
                <label className={styles.fileInput}><span>이미지 업로드</span><input type="file" accept="image/png,image/jpeg,image/webp" disabled={!blobUploadEnabled || uploading} onChange={(event) => void uploadImage(event.target.files?.[0])} /><small>{blobUploadEnabled ? "PNG/JPEG/WebP · 최대 5MB" : "Blob 미설정 · URL 직접 입력 사용"}</small></label>
                {draft.resultPreviewImage ? <span className={styles.resultPreview}><Image src={draft.resultPreviewImage} alt="결과 장비 미리보기" fill sizes="240px" unoptimized /></span> : null}
                <label><span>내부 메모(플레이어 비공개)</span><textarea maxLength={1000} rows={3} value={draft.internalNote} onChange={(event) => setDraft((current) => ({ ...current, internalNote: event.target.value }))} /></label>
              </Box>
              <button className={styles.primaryAction} type="submit" disabled={quoteMutation.isPending || uploading}>{quoteMutation.isPending ? "견적 저장 중" : selected.quote ? "견적 수정 발행" : "견적 발행"}</button>
            </form>
          ) : null}

          <Box className={styles.operations}>
            <Eyebrow>OPERATIONS</Eyebrow>
            <label><span>운영 메모 / 반려·취소 사유</span><textarea maxLength={1000} rows={3} value={operatorNote} onChange={(event) => setOperatorNote(event.target.value)} /></label>
            <div>
              {selected.status === "REQUESTED" ? <button type="button" onClick={() => updateStatus("IN_REVIEW")}>검토 시작</button> : null}
              {["REQUESTED", "IN_REVIEW", "APPROVED", "QUOTED"].includes(selected.status) ? <button type="button" disabled={!operatorNote.trim()} onClick={() => updateStatus("REJECTED")}>요청 반려</button> : null}
              {selected.status === "IN_PROGRESS" ? <button type="button" disabled={!operatorNote.trim() || cancelMutation.isPending} onClick={() => cancelMutation.mutate({ requestId: selected._id, note: operatorNote.trim() }, { onSuccess: () => setFeedback({ tone: "success", text: "비용과 물품을 반환하고 제작을 취소했습니다." }), onError: (error) => setFeedback({ tone: "error", text: errorMessage(error) }) })}>제작 취소·전액 복구</button> : null}
            </div>
          </Box>
          {feedback ? <p className={styles.feedback} data-tone={feedback.tone} role="status">{feedback.text}</p> : null}
        </main>
      </div>
    </div>
  );
}
