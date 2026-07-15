"use client";

import Image from "next/image";
import {
  type FocusEvent,
  type FormEvent,
  useId,
  useMemo,
  useState,
} from "react";

import Box from "@/components/ui/Box/Box";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import {
  useApproveEquipmentWorkshopReload,
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
  EquipmentWorkshopModificationDomain,
  EquipmentWorkshopSpecialist,
  EquipmentWorkshopRequestStatus,
} from "@/lib/equipment-shop/workshop-request";
import { WORKSHOP_COST_POLICY } from "@/lib/equipment-shop/workshop-request";

import styles from "./page.module.css";

interface Props {
  initialRequests: EquipmentWorkshopRequestsResponse;
  items: MaterialOption[];
  blobUploadEnabled: boolean;
}

interface MaterialOption {
  id: string;
  name: string;
  category: string;
  unitPrice: number;
}

interface QuoteDraft {
  expectedVersion: number;
  creditCost: string;
  durationMinutes: string;
  specialistCodename: EquipmentWorkshopSpecialist;
  specialistNote: string;
  modificationDomain: EquipmentWorkshopModificationDomain;
  materials: Array<{ itemId: string; quantity: string }>;
  resultName: string;
  resultDescription: string;
  resultDamage: string;
  resultEffect: string;
  resultTags: string;
  resultPreviewImage: string;
  actionCode: string;
  actionName: string;
  actionDescription: string;
  actionEffect: string;
  actionMaxCharges: string;
  actionReloadCreditCost: string;
  internalNote: string;
}

const SPECIALISTS: EquipmentWorkshopSpecialist[] = [
  "VERNIER",
  "TEMPER",
  "TOWASKI",
  "SUTURE",
  "RATCHET",
];

const MODIFICATION_DOMAINS: Array<{
  value: EquipmentWorkshopModificationDomain;
  label: string;
}> = [
  { value: "GENERAL", label: "일반 개조" },
  { value: "ENERGY_EXPLOSIVE_OUTPUT", label: "에너지장·폭발·출력" },
  { value: "BIO_REGEN_REPAIR", label: "생체 접속·재생·자기수복" },
];

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
    specialistCodename: request.quote?.specialistCodename ?? "VERNIER",
    specialistNote: request.quote?.specialistNote ?? "",
    modificationDomain: request.quote?.modificationDomain ?? "GENERAL",
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
    actionCode: request.quote?.result.equipmentAction?.code ?? "",
    actionName: request.quote?.result.equipmentAction?.name ?? "",
    actionDescription: request.quote?.result.equipmentAction?.description ?? "",
    actionEffect: request.quote?.result.equipmentAction?.effect ?? "",
    actionMaxCharges: String(request.quote?.result.equipmentAction?.maxCharges ?? 1),
    actionReloadCreditCost: String(request.quote?.result.equipmentAction?.reloadCreditCost ?? 200),
    internalNote: request.internalNote ?? "",
  };
}

function errorMessage(error: unknown): string {
  return error instanceof EquipmentShopApiError || error instanceof Error
    ? error.message
    : "공방 요청 처리에 실패했습니다.";
}

function SearchableMaterialSelect({
  excludedItemId,
  items,
  onChange,
  value,
}: {
  excludedItemId?: string;
  items: MaterialOption[];
  onChange: (itemId: string) => void;
  value: string;
}) {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = items.find((item) => item.id === value);
  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return items
      .filter((item) => item.id !== excludedItemId)
      .filter(
        (item) =>
          !normalized ||
          item.name.toLowerCase().includes(normalized) ||
          item.category.toLowerCase().includes(normalized),
      );
  }, [excludedItemId, items, query]);

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    const nextFocus = event.relatedTarget;
    if (nextFocus instanceof Node && event.currentTarget.contains(nextFocus)) return;
    close();
  };

  return (
    <div className={styles.materialPicker} onBlur={handleBlur}>
      <input
        type="text"
        role="combobox"
        aria-controls={listboxId}
        aria-expanded={open}
        aria-label="재료 검색 및 선택"
        aria-autocomplete="list"
        autoComplete="off"
        placeholder="재료 이름 또는 분류 검색"
        value={open ? query : selected ? `${selected.name} · ${selected.category} · ${selected.unitPrice.toLocaleString()} CR` : ""}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          if (value) onChange("");
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") close();
        }}
      />
      {open ? (
        <div id={listboxId} className={styles.materialPicker__menu} role="listbox" aria-label="재료 검색 결과">
          {filteredItems.length > 0 ? (
            filteredItems.map((item) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={item.id === value}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(item.id);
                  close();
                }}
              >
                <strong>{item.name}</strong>
                <span>{item.category} · {item.unitPrice.toLocaleString()} CR</span>
              </button>
            ))
          ) : (
            <p>검색 결과가 없습니다.</p>
          )}
        </div>
      ) : null}
    </div>
  );
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
  const approveReloadMutation = useApproveEquipmentWorkshopReload();
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

  const materialCost = draft.materials.reduce((total, material) => {
    const option = items.find((item) => item.id === material.itemId);
    return total + (option?.unitPrice ?? 0) * (Number(material.quantity) || 0);
  }, 0);
  const totalCost = materialCost + (Number(draft.creditCost) || 0);

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
    if (draft.materials.some((material) => !material.itemId)) {
      setFeedback({ tone: "error", text: "추가한 모든 재료를 검색해 선택해 주세요." });
      return;
    }
    quoteMutation.mutate(
      {
        requestId: selected._id,
        quote: {
          expectedVersion: draft.expectedVersion,
          creditCost: Number(draft.creditCost),
          durationMinutes: Number(draft.durationMinutes),
          specialistCodename: draft.specialistCodename,
          ...(draft.specialistNote.trim()
            ? { specialistNote: draft.specialistNote.trim() }
            : {}),
          modificationDomain: draft.modificationDomain,
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
            ...(draft.actionCode.trim()
              ? {
                  equipmentAction: {
                    code: draft.actionCode.trim().toUpperCase(),
                    name: draft.actionName.trim(),
                    description: draft.actionDescription.trim(),
                    effect: draft.actionEffect.trim(),
                    actionCost: 1,
                    chargeCost: 1,
                    maxCharges: Number(draft.actionMaxCharges),
                    reloadCreditCost: Number(draft.actionReloadCreditCost),
                    reloadApproval: "GM" as const,
                  },
                }
              : {}),
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
              <small>{request.equipmentName ?? (request.kind === "custom" ? "커스텀 제작" : request.kind === "reload" ? "재장전 결재" : "장비 강화")}</small>
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
                <div className={styles.twoColumns}>
                  <label>
                    <span>주 specialist</span>
                    <select value={draft.specialistCodename} onChange={(event) => setDraft((current) => ({ ...current, specialistCodename: event.target.value as EquipmentWorkshopSpecialist }))}>
                      {SPECIALISTS.map((specialist) => <option key={specialist} value={specialist}>{specialist}</option>)}
                    </select>
                  </label>
                  <label><span>담당 표기</span><input maxLength={200} value={draft.specialistNote} onChange={(event) => setDraft((current) => ({ ...current, specialistNote: event.target.value }))} placeholder="VERNIER 접수·통합 / TOWASKI 폭발물 검수" /></label>
                </div>
                <label>
                  <span>개조 계통</span>
                  <select value={draft.modificationDomain} onChange={(event) => setDraft((current) => ({ ...current, modificationDomain: event.target.value as EquipmentWorkshopModificationDomain }))}>
                    {MODIFICATION_DOMAINS.map((domain) => <option key={domain.value} value={domain.value}>{domain.label}</option>)}
                  </select>
                </label>
                <p>
                  현재 스냅샷 기준 재료 {materialCost.toLocaleString()} CR + 공임 {(Number(draft.creditCost) || 0).toLocaleString()} CR = 총부담 {totalCost.toLocaleString()} CR
                </p>
                <small>
                  경량 개조 {WORKSHOP_COST_POLICY.utilityCreditRange[0]}~{WORKSHOP_COST_POLICY.utilityCreditRange[1]} CR · 액션 부여 희귀 재료 + 재료가의 20~40% · 상위 강화 희귀 재료 + {WORKSHOP_COST_POLICY.advancedCreditRange[0].toLocaleString()}~{WORKSHOP_COST_POLICY.advancedCreditRange[1].toLocaleString()} CR
                </small>
              </Box>
              <Box>
                <div className={styles.sectionTitle}><Eyebrow>MATERIALS</Eyebrow><button type="button" onClick={() => setDraft((current) => ({ ...current, materials: [...current.materials, { itemId: "", quantity: "1" }] }))}>재료 추가</button></div>
                <div className={styles.materialRows}>
                  {draft.materials.map((material, index) => (
                    <div className={styles.materialRow} key={`${index}:${material.itemId}`}>
                      <SearchableMaterialSelect
                        excludedItemId={selected.sourceItemId}
                        items={items}
                        value={material.itemId}
                        onChange={(itemId) => updateMaterial(index, { itemId })}
                      />
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
                <Eyebrow>EQUIPMENT ACTION (OPTIONAL)</Eyebrow>
                <div className={styles.twoColumns}>
                  <label><span>액션 코드</span><input maxLength={3} value={draft.actionCode} onChange={(event) => setDraft((current) => ({ ...current, actionCode: event.target.value }))} placeholder="U1" /></label>
                  <label><span>액션명</span><input maxLength={80} value={draft.actionName} onChange={(event) => setDraft((current) => ({ ...current, actionName: event.target.value }))} /></label>
                </div>
                <label><span>액션 설명</span><textarea maxLength={500} rows={3} value={draft.actionDescription} onChange={(event) => setDraft((current) => ({ ...current, actionDescription: event.target.value }))} /></label>
                <label><span>액션 효과</span><textarea maxLength={1000} rows={6} value={draft.actionEffect} onChange={(event) => setDraft((current) => ({ ...current, actionEffect: event.target.value }))} /></label>
                <div className={styles.twoColumns}>
                  <label><span>최대 충전</span><input type="number" min="1" max="99" step="1" value={draft.actionMaxCharges} onChange={(event) => setDraft((current) => ({ ...current, actionMaxCharges: event.target.value }))} /></label>
                  <label><span>GM 재장전 비용</span><input type="number" min="0" step="0.01" value={draft.actionReloadCreditCost} onChange={(event) => setDraft((current) => ({ ...current, actionReloadCreditCost: event.target.value }))} /></label>
                </div>
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
              {selected.kind === "reload" && ["REQUESTED", "IN_REVIEW", "APPROVED"].includes(selected.status) ? <button type="button" disabled={approveReloadMutation.isPending} onClick={() => approveReloadMutation.mutate({ requestId: selected._id }, { onSuccess: () => setFeedback({ tone: "success", text: `${selected.reload?.creditCost.toLocaleString() ?? "0"} CR 결제와 충전 복구를 한 트랜잭션으로 승인했습니다.` }), onError: (error) => setFeedback({ tone: "error", text: errorMessage(error) }) })}>관료 결재 승인·재장전</button> : null}
            </div>
          </Box>
          {feedback ? <p className={styles.feedback} data-tone={feedback.tone} role="status">{feedback.text}</p> : null}
        </main>
      </div>
    </div>
  );
}
