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
  useArchiveEquipmentWorkshopBlueprint,
  useCancelEquipmentWorkshopRequest,
  useCreateEquipmentWorkshopBlueprint,
  useQuoteEquipmentWorkshopRequest,
  useUpdateEquipmentWorkshopBlueprint,
  useUpdateEquipmentWorkshopRequest,
} from "@/hooks/mutations/useEquipmentShopMutation";
import {
  EquipmentShopApiError,
  type EquipmentWorkshopBlueprintsResponse,
  type EquipmentWorkshopRequestsResponse,
  useEquipmentWorkshopBlueprints,
  useEquipmentWorkshopRequests,
} from "@/hooks/queries/useEquipmentShopQuery";
import type {
  EquipmentWorkshopBlueprintInput,
  SerializedEquipmentWorkshopBlueprint,
} from "@/lib/equipment-shop/workshop-blueprint";
import {
  WORKSHOP_COST_POLICY,
  type AdminSerializedEquipmentWorkshopRequest,
  type EquipmentWorkshopModificationDomain,
  type EquipmentWorkshopRequestStatus,
  type EquipmentWorkshopSpecialist,
} from "@/lib/equipment-shop/workshop-request";

import styles from "./page.module.css";

interface Props {
  initialRequests: EquipmentWorkshopRequestsResponse;
  initialBlueprints: EquipmentWorkshopBlueprintsResponse;
  items: MaterialOption[];
  blobUploadEnabled: boolean;
}

interface MaterialOption {
  id: string;
  slug: string;
  name: string;
  category: string;
  isPublic: boolean;
  unitPrice: number;
}

interface QuoteDraft {
  expectedVersion: number;
  creditCost: string;
  durationMinutes: string;
  specialistCodename: EquipmentWorkshopSpecialist;
  specialistNote: string;
  modificationDomain: EquipmentWorkshopModificationDomain;
  materials: Array<{ slug: string; quantity: string }>;
  resultName: string;
  resultDescription: string;
  resultCategory: "WEAPON" | "ARMOR";
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

const SPECIALIST_LABELS: Record<EquipmentWorkshopSpecialist, string> = {
  VERNIER: "에이다 슈라이버 (VERNIER)",
  TEMPER: "브리짓 케인 (TEMPER)",
  TOWASKI: "립 토와스키 (TOWASKI)",
  SUTURE: "이레나 부코비치 (SUTURE)",
  RATCHET: "마테오 리바스 (RATCHET)",
};

const MODIFICATION_DOMAINS: Array<{
  value: EquipmentWorkshopModificationDomain;
  label: string;
}> = [
  { value: "GENERAL", label: "일반 개조 (GENERAL)" },
  {
    value: "ENERGY_EXPLOSIVE_OUTPUT",
    label: "에너지·폭발·출력 (ENERGY / EXPLOSIVE / OUTPUT)",
  },
  {
    value: "BIO_REGEN_REPAIR",
    label: "생체·재생·자기수복 (BIO / REGEN / REPAIR)",
  },
];

const STATUS_LABELS: Record<EquipmentWorkshopRequestStatus, string> = {
  REQUESTED: "접수 (REQUESTED)",
  IN_REVIEW: "검토 중 (IN REVIEW)",
  APPROVED: "기존 승인 (APPROVED)",
  QUOTED: "견적 발행 (QUOTED)",
  IN_PROGRESS: "제작 중 (IN PROGRESS)",
  DECLINED: "의뢰인 거절 (DECLINED)",
  REJECTED: "운영 반려 (REJECTED)",
  CANCELLED: "제작 취소 (CANCELLED)",
  COMPLETED: "수령 완료 (COMPLETED)",
};

const QUOTABLE = new Set<EquipmentWorkshopRequestStatus>([
  "IN_REVIEW",
  "APPROVED",
  "QUOTED",
]);

const DURATION_PRESETS = [
  { minutes: 60, label: "1시간" },
  { minutes: 1440, label: "24시간 · 1일" },
  { minutes: 4320, label: "72시간 · 3일" },
  { minutes: 10080, label: "168시간 · 7일" },
];

function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 1) return "시간 미지정";
  const hours = minutes / 60;
  const days = hours / 24;
  const hoursLabel = Number.isInteger(hours)
    ? `${hours.toLocaleString()}시간`
    : `${minutes.toLocaleString()}분`;
  return days >= 1 && Number.isInteger(days)
    ? `${hoursLabel} · ${days.toLocaleString()}일`
    : hoursLabel;
}

function createDraft(
  request: AdminSerializedEquipmentWorkshopRequest,
  items: MaterialOption[],
): QuoteDraft {
  return {
    expectedVersion: request.quote?.version ?? 0,
    creditCost: String(request.quote?.creditCost ?? 0),
    durationMinutes: String(request.quote?.durationMinutes ?? 60),
    specialistCodename: request.quote?.specialistCodename ?? "VERNIER",
    specialistNote: request.quote?.specialistNote ?? "",
    modificationDomain: request.quote?.modificationDomain ?? "GENERAL",
    materials:
      request.quote?.materials.map((material) => ({
        slug:
          material.slug ??
          items.find((item) => item.id === material.itemId)?.slug ??
          "",
        quantity: String(material.quantity),
      })) ?? [],
    resultName:
      request.quote?.result.name ?? `${request.equipmentName ?? "신규 장비"} · 제작형`,
    resultDescription: request.quote?.result.description ?? request.details,
    resultCategory:
      request.quote?.result.category ?? request.sourceSlot ?? "WEAPON",
    resultDamage: request.quote?.result.damage ?? request.sourceDamage ?? "",
    resultEffect: request.quote?.result.effect ?? "",
    resultTags: request.quote?.result.tags.join(", ") ?? "",
    // 정확한 결과 자산만 사용한다. 원본 장비 이미지는 상속하지 않는다.
    resultPreviewImage: request.quote?.result.previewImage ?? "",
    actionCode: request.quote?.result.equipmentAction?.code ?? "",
    actionName: request.quote?.result.equipmentAction?.name ?? "",
    actionDescription:
      request.quote?.result.equipmentAction?.description ?? "",
    actionEffect: request.quote?.result.equipmentAction?.effect ?? "",
    actionMaxCharges: String(
      request.quote?.result.equipmentAction?.maxCharges ?? 1,
    ),
    actionReloadCreditCost: String(
      request.quote?.result.equipmentAction?.reloadCreditCost ?? 200,
    ),
    internalNote: request.internalNote ?? "",
  };
}

function draftFromBlueprint(
  current: QuoteDraft,
  blueprint: SerializedEquipmentWorkshopBlueprint,
): QuoteDraft {
  const { defaults } = blueprint;
  return {
    ...current,
    creditCost: String(defaults.creditCost),
    durationMinutes: String(defaults.durationMinutes),
    specialistCodename: defaults.specialistCodename,
    specialistNote: defaults.specialistNote ?? "",
    modificationDomain: defaults.modificationDomain,
    materials: defaults.materials.map((material) => ({
      slug: material.slug,
      quantity: String(material.quantity),
    })),
    resultName: defaults.result.name,
    resultDescription: defaults.result.description,
    resultCategory: blueprint.applicability.resultCategory,
    resultDamage: defaults.result.damage ?? "",
    resultEffect: defaults.result.effect ?? "",
    resultTags: defaults.result.tags?.join(", ") ?? "",
    resultPreviewImage: defaults.result.previewImage ?? "",
    actionCode: defaults.result.equipmentAction?.code ?? "",
    actionName: defaults.result.equipmentAction?.name ?? "",
    actionDescription: defaults.result.equipmentAction?.description ?? "",
    actionEffect: defaults.result.equipmentAction?.effect ?? "",
    actionMaxCharges: String(
      defaults.result.equipmentAction?.maxCharges ?? 1,
    ),
    actionReloadCreditCost: String(
      defaults.result.equipmentAction?.reloadCreditCost ?? 200,
    ),
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
  onChange: (slug: string) => void;
  value: string;
}) {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = items.find((item) => item.slug === value);
  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return items
      .filter(
        (item) =>
          item.id !== excludedItemId && item.slug && item.isPublic,
      )
      .filter(
        (item) =>
          !normalized ||
          item.name.toLowerCase().includes(normalized) ||
          item.slug.toLowerCase().includes(normalized) ||
          item.category.toLowerCase().includes(normalized),
      );
  }, [excludedItemId, items, query]);

  const close = () => {
    setOpen(false);
    setQuery("");
  };
  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    const nextFocus = event.relatedTarget;
    if (
      nextFocus instanceof Node &&
      event.currentTarget.contains(nextFocus)
    ) {
      return;
    }
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
        placeholder="재료 이름·slug·분류 검색"
        value={
          open
            ? query
            : selected
              ? `${selected.name} · ${selected.slug} · ${selected.unitPrice.toLocaleString()} CR`
              : value
        }
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
        <div
          id={listboxId}
          className={styles.materialPicker__menu}
          role="listbox"
          aria-label="재료 검색 결과"
        >
          {filteredItems.length > 0 ? (
            filteredItems.map((item) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={item.slug === value}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(item.slug);
                  close();
                }}
              >
                <strong>{item.name}</strong>
                <span>
                  {item.slug} · {item.category} · {item.unitPrice.toLocaleString()} CR
                </span>
              </button>
            ))
          ) : (
            <p>사용 가능한 공개 재료가 없습니다.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function EquipmentWorkshopAdminClient({
  initialRequests,
  initialBlueprints,
  items,
  blobUploadEnabled,
}: Props) {
  const requestsQuery = useEquipmentWorkshopRequests({
    viewerKey: "gm",
    initialData: initialRequests,
  });
  const blueprintsQuery = useEquipmentWorkshopBlueprints({
    initialData: initialBlueprints,
  });
  const requests = useMemo(
    () =>
      (requestsQuery.data?.requests ?? []) as AdminSerializedEquipmentWorkshopRequest[],
    [requestsQuery.data?.requests],
  );
  const blueprints = blueprintsQuery.data?.blueprints ?? [];
  const firstRequest = requests[0];
  const initialDraft = firstRequest ? createDraft(firstRequest, items) : null;

  const quoteMutation = useQuoteEquipmentWorkshopRequest();
  const createBlueprintMutation = useCreateEquipmentWorkshopBlueprint();
  const updateBlueprintMutation = useUpdateEquipmentWorkshopBlueprint();
  const archiveBlueprintMutation = useArchiveEquipmentWorkshopBlueprint();
  const cancelMutation = useCancelEquipmentWorkshopRequest();
  const approveReloadMutation = useApproveEquipmentWorkshopReload();
  const statusMutation = useUpdateEquipmentWorkshopRequest();

  const [selectedId, setSelectedId] = useState(firstRequest?._id ?? "");
  const [selectedBlueprintId, setSelectedBlueprintId] = useState("");
  const [blueprintSlug, setBlueprintSlug] = useState("");
  const [blueprintDisplayName, setBlueprintDisplayName] = useState("");
  const [compatibleOnly, setCompatibleOnly] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ACTIVE");
  const [draft, setDraft] = useState<QuoteDraft | null>(initialDraft);
  const [baseline, setBaseline] = useState(
    initialDraft ? JSON.stringify(initialDraft) : "",
  );
  const [operatorNote, setOperatorNote] = useState("");
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const [uploading, setUploading] = useState(false);

  const selected =
    requests.find((request) => request._id === selectedId) ?? requests[0];
  const selectedBlueprint = blueprints.find(
    (blueprint) => blueprint._id === selectedBlueprintId,
  );
  const sourceItem = selected?.sourceItemId
    ? items.find((item) => item.id === selected.sourceItemId)
    : undefined;
  const isBuildRequest =
    selected?.kind === "upgrade" || selected?.kind === "custom";
  const buildKind =
    selected?.kind === "upgrade" || selected?.kind === "custom"
      ? selected.kind
      : null;
  const sourceEquipmentCategory =
    selected?.sourceCategory === "WEAPON" ||
    selected?.sourceCategory === "ARMOR"
      ? selected.sourceCategory
      : undefined;
  const sourceCompatibilityUnknown =
    selected?.kind === "upgrade" &&
    (!sourceItem?.slug || !sourceEquipmentCategory || !selected.sourceSlot);

  const isCompatible = (
    blueprint: SerializedEquipmentWorkshopBlueprint,
  ): boolean => {
    if (!selected || !buildKind) return false;
    if (!blueprint.applicability.kinds.includes(buildKind)) return false;
    if (
      selected.kind === "upgrade" &&
      selected.sourceSlot &&
      blueprint.applicability.resultCategory !== selected.sourceSlot
    ) {
      return false;
    }
    if (
      blueprint.applicability.sourceSlugs.length > 0 &&
      sourceItem?.slug &&
      !blueprint.applicability.sourceSlugs.includes(sourceItem.slug)
    ) {
      return false;
    }
    if (
      blueprint.applicability.sourceCategories.length > 0 &&
      sourceEquipmentCategory &&
      !blueprint.applicability.sourceCategories.includes(
        sourceEquipmentCategory,
      )
    ) {
      return false;
    }
    return true;
  };

  const filteredBlueprints = blueprints.filter(
    (blueprint) => !compatibleOnly || isCompatible(blueprint),
  );
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return requests.filter((request) => {
      const statusMatch =
        statusFilter === "ALL" ||
        (statusFilter === "ACTIVE"
          ? [
              "REQUESTED",
              "IN_REVIEW",
              "APPROVED",
              "QUOTED",
              "IN_PROGRESS",
            ].includes(request.status)
          : request.status === statusFilter);
      const textMatch =
        !needle ||
        [
          request.characterCodename,
          request.equipmentName,
          request.userName,
          request.details,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle));
      return statusMatch && textMatch;
    });
  }, [requests, search, statusFilter]);

  if (!selected || !draft) return <Box>공방 요청이 없습니다.</Box>;

  const materialRows = draft.materials.map((material) => ({
    ...material,
    option: items.find((item) => item.slug === material.slug),
  }));
  const materialCost = materialRows.reduce(
    (total, material) =>
      total +
      (material.option?.unitPrice ?? 0) *
        (Number(material.quantity) || 0),
    0,
  );
  const totalCost = materialCost + (Number(draft.creditCost) || 0);
  const missingMaterials = materialRows.filter(
    (material) =>
      !material.option || !material.option.isPublic || !material.slug,
  );
  const draftDirty = JSON.stringify(draft) !== baseline;
  const selectedBlueprintCompatible =
    !selectedBlueprint ||
    (isCompatible(selectedBlueprint) &&
      selectedBlueprint.applicability.resultCategory === draft.resultCategory);
  const sourceResultDiff = [
    {
      label: "이름",
      before: selected.equipmentName ?? "원본 없음",
      after: draft.resultName || "미입력",
    },
    {
      label: "분류",
      before: selected.sourceCategory ?? "원본 없음",
      after: draft.resultCategory,
    },
    {
      label: "피해",
      before: selected.sourceDamage ?? "기록 없음",
      after: draft.resultDamage || "기록 없음",
    },
    {
      label: "장비 액션",
      before: "없음 또는 원본 유지 안 함",
      after: draft.actionCode
        ? `${draft.actionCode.toUpperCase()} · ${draft.actionName || "이름 미입력"}`
        : "없음",
    },
  ];

  const selectRequest = (
    request: AdminSerializedEquipmentWorkshopRequest,
  ) => {
    const nextDraft = createDraft(request, items);
    const quoteBlueprint = request.quote?.blueprintRef;
    const matchedBlueprint = quoteBlueprint
      ? blueprints.find(
          (blueprint) =>
            blueprint._id === quoteBlueprint.id &&
            blueprint.version === quoteBlueprint.version,
        )
      : undefined;
    setSelectedId(request._id);
    setDraft(nextDraft);
    setBaseline(JSON.stringify(nextDraft));
    setSelectedBlueprintId(matchedBlueprint?._id ?? "");
    setBlueprintSlug(matchedBlueprint?.slug ?? "");
    setBlueprintDisplayName(matchedBlueprint?.displayName ?? "");
    setOperatorNote("");
    setFeedback(null);
  };

  const applyBlueprint = (blueprintId: string) => {
    setSelectedBlueprintId(blueprintId);
    const blueprint = blueprints.find((entry) => entry._id === blueprintId);
    if (!blueprint) {
      setBlueprintSlug("");
      setBlueprintDisplayName("");
      return;
    }
    setBlueprintSlug(blueprint.slug);
    setBlueprintDisplayName(blueprint.displayName);
    setDraft((current) =>
      current ? draftFromBlueprint(current, blueprint) : current,
    );
    setFeedback({
      tone: "success",
      text: `${blueprint.displayName} v${blueprint.version} 기본값을 요청 편집본에 불러왔습니다. 공용 설계안은 변경되지 않았습니다.`,
    });
  };

  const updateMaterial = (
    index: number,
    patch: Partial<QuoteDraft["materials"][number]>,
  ) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            materials: current.materials.map((material, materialIndex) =>
              materialIndex === index
                ? { ...material, ...patch }
                : material,
            ),
          }
        : current,
    );
  };

  const buildBlueprintInput = (): EquipmentWorkshopBlueprintInput => ({
    slug: blueprintSlug.trim(),
    displayName: blueprintDisplayName.trim(),
    applicability: {
      kinds: [selected.kind === "custom" ? "custom" : "upgrade"],
      sourceSlugs:
        selected.kind === "upgrade" && sourceItem?.slug
          ? [sourceItem.slug]
          : [],
      sourceCategories:
        selected.kind === "upgrade" && sourceEquipmentCategory
          ? [sourceEquipmentCategory]
          : [],
      resultCategory: draft.resultCategory,
    },
    defaults: {
      creditCost: Number(draft.creditCost),
      durationMinutes: Number(draft.durationMinutes),
      specialistCodename: draft.specialistCodename,
      ...(draft.specialistNote.trim()
        ? { specialistNote: draft.specialistNote.trim() }
        : {}),
      modificationDomain: draft.modificationDomain,
      materials: draft.materials.map((material) => ({
        slug: material.slug,
        quantity: Number(material.quantity),
      })),
      result: {
        name: draft.resultName,
        description: draft.resultDescription,
        ...(draft.resultDamage.trim()
          ? { damage: draft.resultDamage.trim() }
          : {}),
        ...(draft.resultEffect.trim()
          ? { effect: draft.resultEffect.trim() }
          : {}),
        tags: draft.resultTags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        ...(draft.resultPreviewImage.trim()
          ? { previewImage: draft.resultPreviewImage.trim() }
          : {}),
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
    },
  });

  const saveNewBlueprint = () => {
    createBlueprintMutation.mutate(buildBlueprintInput(), {
      onSuccess: ({ blueprint }) => {
        setSelectedBlueprintId(blueprint._id);
        setBlueprintSlug(blueprint.slug);
        setBlueprintDisplayName(blueprint.displayName);
        setFeedback({
          tone: "success",
          text: `새 설계안 ${blueprint.displayName} v${blueprint.version}을 저장했습니다. 요청·경제 상태는 변경하지 않았습니다.`,
        });
      },
      onError: (error) =>
        setFeedback({ tone: "error", text: errorMessage(error) }),
    });
  };

  const updateSelectedBlueprint = () => {
    if (!selectedBlueprint) return;
    updateBlueprintMutation.mutate(
      {
        id: selectedBlueprint._id,
        expectedVersion: selectedBlueprint.version,
        blueprint: buildBlueprintInput(),
      },
      {
        onSuccess: ({ blueprint }) => {
          setFeedback({
            tone: "success",
            text: `${blueprint.displayName}을 v${blueprint.version}으로 갱신했습니다. 기존 견적 스냅샷은 유지됩니다.`,
          });
        },
        onError: (error) =>
          setFeedback({ tone: "error", text: errorMessage(error) }),
      },
    );
  };

  const archiveSelectedBlueprint = () => {
    if (!selectedBlueprint) return;
    archiveBlueprintMutation.mutate(
      {
        id: selectedBlueprint._id,
        expectedVersion: selectedBlueprint.version,
      },
      {
        onSuccess: ({ blueprint }) => {
          setSelectedBlueprintId("");
          setFeedback({
            tone: "success",
            text: `${blueprint.displayName}을 보관했습니다. 기존 견적 스냅샷은 유지됩니다.`,
          });
        },
        onError: (error) =>
          setFeedback({ tone: "error", text: errorMessage(error) }),
      },
    );
  };

  const submitQuote = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (missingMaterials.length > 0) {
      setFeedback({
        tone: "error",
        text: "모든 재료를 현재 공개 마스터 품목에서 선택해 주세요.",
      });
      return;
    }
    quoteMutation.mutate(
      {
        requestId: selected._id,
        quote: {
          expectedVersion: draft.expectedVersion,
          ...(selectedBlueprint
            ? {
                blueprintRef: {
                  id: selectedBlueprint._id,
                  slug: selectedBlueprint.slug,
                  version: selectedBlueprint.version,
                },
              }
            : {}),
          creditCost: Number(draft.creditCost),
          durationMinutes: Number(draft.durationMinutes),
          specialistCodename: draft.specialistCodename,
          ...(draft.specialistNote.trim()
            ? { specialistNote: draft.specialistNote.trim() }
            : {}),
          modificationDomain: draft.modificationDomain,
          materials: draft.materials.map((material) => ({
            slug: material.slug,
            quantity: Number(material.quantity),
          })),
          result: {
            name: draft.resultName,
            description: draft.resultDescription,
            category: draft.resultCategory,
            ...(draft.resultDamage.trim()
              ? { damage: draft.resultDamage.trim() }
              : {}),
            ...(draft.resultEffect.trim()
              ? { effect: draft.resultEffect.trim() }
              : {}),
            tags: draft.resultTags
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean),
            ...(draft.resultPreviewImage.trim()
              ? { previewImage: draft.resultPreviewImage.trim() }
              : {}),
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
                    reloadCreditCost: Number(
                      draft.actionReloadCreditCost,
                    ),
                    reloadApproval: "GM" as const,
                  },
                }
              : {}),
          },
          ...(draft.internalNote.trim()
            ? { internalNote: draft.internalNote.trim() }
            : {}),
        },
      },
      {
        onSuccess: ({ request }) => {
          const nextDraft = createDraft(request, items);
          setSelectedId(request._id);
          setDraft(nextDraft);
          setBaseline(JSON.stringify(nextDraft));
          setFeedback({
            tone: "success",
            text: `견적 (QUOTE) v${request.quote?.version}을 발행했습니다. 아직 실제 장비는 생성되지 않았습니다.`,
          });
        },
        onError: (error) =>
          setFeedback({ tone: "error", text: errorMessage(error) }),
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
      const response = await fetch(
        "/api/erp/admin/equipment-workshop/assets",
        { method: "POST", body },
      );
      const result = (await response.json()) as {
        url?: string;
        error?: string;
      };
      if (!response.ok || !result.url) {
        throw new Error(result.error ?? "이미지 업로드에 실패했습니다.");
      }
      setDraft((current) =>
        current
          ? { ...current, resultPreviewImage: result.url ?? "" }
          : current,
      );
      setFeedback({
        tone: "success",
        text: "정확한 결과 장비 이미지를 편집본에 연결했습니다.",
      });
    } catch (error) {
      setFeedback({ tone: "error", text: errorMessage(error) });
    } finally {
      setUploading(false);
    }
  };

  const updateStatus = (status: EquipmentWorkshopRequestStatus) => {
    statusMutation.mutate(
      {
        requestId: selected._id,
        status,
        ...(operatorNote.trim()
          ? { operatorNote: operatorNote.trim() }
          : {}),
      },
      {
        onSuccess: () =>
          setFeedback({
            tone: "success",
            text: `${STATUS_LABELS[status]} 상태로 변경했습니다.`,
          }),
        onError: (error) =>
          setFeedback({ tone: "error", text: errorMessage(error) }),
      },
    );
  };

  const readyLabel =
    selected.computedStatus === "READY"
      ? "준비 완료 (READY)"
      : STATUS_LABELS[selected.status];

  return (
    <div className={styles.root}>
      <Box className={styles.toolbar}>
        <label>
          <span>요청 검색</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="캐릭터·장비·사용자"
          />
        </label>
        <label>
          <span>처리 상태</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="ACTIVE">진행 중 전체</option>
            <option value="ALL">전체</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </Box>

      <div className={styles.workspace}>
        <aside className={styles.requestList} aria-label="공방 요청 목록">
          {filtered.map((request) => (
            <button
              key={request._id}
              type="button"
              data-active={request._id === selected._id}
              onClick={() => selectRequest(request)}
            >
              <span>{STATUS_LABELS[request.status]}</span>
              <strong>{request.characterCodename}</strong>
              <small>
                {request.equipmentName ??
                  (request.kind === "custom"
                    ? "신규 제작"
                    : request.kind === "reload"
                      ? "재장전 결재"
                      : "장비 강화")}
              </small>
            </button>
          ))}
        </aside>

        <main className={styles.detail}>
          <div className={styles.progress} aria-label="공방 처리 단계">
            {[
              "1 요청 요약",
              "2 설계안",
              "3 비용·담당",
              "4 재료",
              "5 결과 스펙",
              "6 최종 검토",
              "7 운영 처리",
            ].map((step) => (
              <span key={step}>{step}</span>
            ))}
          </div>

          <Box className={styles.section}>
            <div className={styles.sectionHeading}>
              <div>
                <Eyebrow>1 · 요청·원본 장비 (SOURCE EQUIPMENT)</Eyebrow>
                <h2>{selected.equipmentName ?? "신규 제작 요청"}</h2>
              </div>
              <span className={styles.statusBadge}>{readyLabel}</span>
            </div>
            <div className={styles.sourceCard__content}>
              {selected.sourcePreviewImage ? (
                <span className={styles.preview}>
                  <Image
                    src={selected.sourcePreviewImage}
                    alt="원본 장비"
                    fill
                    sizes="120px"
                    unoptimized
                  />
                </span>
              ) : null}
              <div>
                <p>
                  {selected.characterCodename} · {selected.userName} · {selected.kind}
                </p>
                <p>
                  {selected.sourceCategory ?? "원본 없음"} · {selected.sourceSlot ?? "슬롯 없음"} · {selected.sourceDamage ?? "피해 정보 없음"}
                </p>
                <blockquote>{selected.details}</blockquote>
              </div>
            </div>
          </Box>

          {isBuildRequest && QUOTABLE.has(selected.status) ? (
            <form className={styles.quoteForm} onSubmit={submitQuote}>
              <Box className={styles.section}>
                <div className={styles.sectionHeading}>
                  <div>
                    <Eyebrow>2 · 결과 장비 설계안 (RESULT BLUEPRINT)</Eyebrow>
                    <h2>설계안 선택 후 요청별 편집</h2>
                  </div>
                  <span
                    className={styles.dirtyBadge}
                    data-dirty={draftDirty}
                  >
                    {draftDirty ? "미저장 변경 있음" : "발행본과 동일"}
                  </span>
                </div>
                <div className={styles.blueprintPicker}>
                  <label>
                    <span>설계안 라이브러리</span>
                    <select
                      value={selectedBlueprintId}
                      onChange={(event) => applyBlueprint(event.target.value)}
                    >
                      <option value="">설계안 없이 직접 편집</option>
                      {filteredBlueprints.map((blueprint) => (
                        <option key={blueprint._id} value={blueprint._id}>
                          {blueprint.displayName} · v{blueprint.version}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={compatibleOnly}
                      onChange={(event) =>
                        setCompatibleOnly(event.target.checked)
                      }
                    />
                    현재 요청과 호환되는 설계안만 표시
                  </label>
                </div>
                {selectedBlueprint ? (
                  <p className={styles.blueprintMeta}>
                    현재 설계안 v{selectedBlueprint.version} · {sourceCompatibilityUnknown ? "호환 미확정 — 견적 발행 시 장착 원본 재검증" : selectedBlueprintCompatible ? "호환" : "비호환 — 견적 발행 전 범위·결과 분류 확인 필요"} · {selectedBlueprint.sourceClass} / {selectedBlueprint.balanceStatus}
                  </p>
                ) : (
                  <p className={styles.emptyHint}>
                    설계안 선택은 편집본만 채웁니다. 저장·업데이트·견적 발행은 각각 별도 동작입니다.
                  </p>
                )}

                <details className={styles.blueprintManager}>
                  <summary>설계안 저장·버전 관리</summary>
                  <div className={styles.twoColumns}>
                    <label>
                      <span>고정 slug</span>
                      <input
                        value={blueprintSlug}
                        onChange={(event) => setBlueprintSlug(event.target.value)}
                        disabled={Boolean(selectedBlueprint)}
                        placeholder="example-equipment-blueprint"
                        maxLength={80}
                      />
                    </label>
                    <label>
                      <span>설계안 표시명</span>
                      <input
                        value={blueprintDisplayName}
                        onChange={(event) =>
                          setBlueprintDisplayName(event.target.value)
                        }
                        placeholder="공방 설계안 이름"
                        maxLength={80}
                      />
                    </label>
                  </div>
                  <div className={styles.blueprintActions}>
                    <button
                      type="button"
                      disabled={createBlueprintMutation.isPending}
                      onClick={saveNewBlueprint}
                    >
                      새 설계안으로 저장
                    </button>
                    <button
                      type="button"
                      disabled={!selectedBlueprint || updateBlueprintMutation.isPending}
                      onClick={updateSelectedBlueprint}
                    >
                      선택 설계안 업데이트
                    </button>
                    <button
                      className={styles.archiveAction}
                      type="button"
                      disabled={!selectedBlueprint || archiveBlueprintMutation.isPending}
                      onClick={archiveSelectedBlueprint}
                    >
                      선택 설계안 보관
                    </button>
                  </div>
                </details>
              </Box>

              <Box className={styles.section}>
                <Eyebrow>3 · 비용·제작 시간·담당자</Eyebrow>
                <div className={styles.twoColumns}>
                  <label>
                    <span>공임 (CR)</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      value={draft.creditCost}
                      onChange={(event) =>
                        setDraft({ ...draft, creditCost: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span>주 담당자</span>
                    <select
                      value={draft.specialistCodename}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          specialistCodename: event.target.value as EquipmentWorkshopSpecialist,
                        })
                      }
                    >
                      {Object.entries(SPECIALIST_LABELS).map(
                        ([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                </div>
                <fieldset className={styles.durationPresets}>
                  <legend>
                    제작 시간 · {formatDuration(Number(draft.durationMinutes))}
                  </legend>
                  {DURATION_PRESETS.map((preset) => (
                    <button
                      key={preset.minutes}
                      type="button"
                      data-active={Number(draft.durationMinutes) === preset.minutes}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          durationMinutes: String(preset.minutes),
                        })
                      }
                    >
                      {preset.label}
                    </button>
                  ))}
                </fieldset>
                <details className={styles.advancedSettings}>
                  <summary>고급 시간 설정</summary>
                  <label>
                    <span>직접 입력 (분)</span>
                    <input
                      type="number"
                      min="1"
                      max="43200"
                      step="1"
                      required
                      value={draft.durationMinutes}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          durationMinutes: event.target.value,
                        })
                      }
                    />
                  </label>
                </details>
                <div className={styles.twoColumns}>
                  <label>
                    <span>담당 표기</span>
                    <input
                      maxLength={200}
                      value={draft.specialistNote}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          specialistNote: event.target.value,
                        })
                      }
                      placeholder="에이다 슈라이버 (VERNIER) 접수·통합 / 립 토와스키 (TOWASKI) 폭발물 검수"
                    />
                  </label>
                  <label>
                    <span>개조 계통</span>
                    <select
                      value={draft.modificationDomain}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          modificationDomain: event.target.value as EquipmentWorkshopModificationDomain,
                        })
                      }
                    >
                      {MODIFICATION_DOMAINS.map((domain) => (
                        <option key={domain.value} value={domain.value}>
                          {domain.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </Box>

              <Box className={styles.section}>
                <div className={styles.sectionHeading}>
                  <div>
                    <Eyebrow>4 · 재료 (MATERIALS)</Eyebrow>
                    <h2>현재 마스터 품목 기준</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        materials: [
                          ...draft.materials,
                          { slug: "", quantity: "1" },
                        ],
                      })
                    }
                  >
                    재료 추가
                  </button>
                </div>
                <div className={styles.materialRows}>
                  {draft.materials.length === 0 ? (
                    <p className={styles.emptyHint}>필요 재료 없음</p>
                  ) : null}
                  {draft.materials.map((material, index) => (
                    <div
                      className={styles.materialRow}
                      key={`${index}:${material.slug}`}
                    >
                      <SearchableMaterialSelect
                        excludedItemId={selected.sourceItemId}
                        items={items}
                        value={material.slug}
                        onChange={(slug) => updateMaterial(index, { slug })}
                      />
                      <input
                        aria-label="재료 수량"
                        type="number"
                        min="1"
                        max="999"
                        step="1"
                        required
                        value={material.quantity}
                        onChange={(event) =>
                          updateMaterial(index, {
                            quantity: event.target.value,
                          })
                        }
                      />
                      <button
                        type="button"
                        aria-label="재료 제거"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            materials: draft.materials.filter(
                              (_, rowIndex) => rowIndex !== index,
                            ),
                          })
                        }
                      >
                        제거
                      </button>
                    </div>
                  ))}
                </div>
                {missingMaterials.length > 0 ? (
                  <p className={styles.warning} role="alert">
                    재료 {missingMaterials.length}개가 없거나 비공개 상태입니다. 견적 발행이 차단됩니다.
                  </p>
                ) : null}
              </Box>

              <Box className={styles.section}>
                <Eyebrow>5 · 결과 장비 스펙</Eyebrow>
                <div className={styles.twoColumns}>
                  <label>
                    <span>결과 장비명</span>
                    <input
                      required
                      maxLength={80}
                      value={draft.resultName}
                      onChange={(event) =>
                        setDraft({ ...draft, resultName: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span>결과 분류</span>
                    <select
                      value={draft.resultCategory}
                      disabled={selected.kind === "upgrade"}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          resultCategory: event.target.value as "WEAPON" | "ARMOR",
                        })
                      }
                    >
                      <option value="WEAPON">무기 (WEAPON)</option>
                      <option value="ARMOR">방어구 (ARMOR)</option>
                    </select>
                  </label>
                </div>
                <label>
                  <span>설명</span>
                  <textarea
                    required
                    maxLength={500}
                    rows={4}
                    value={draft.resultDescription}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        resultDescription: event.target.value,
                      })
                    }
                  />
                </label>
                <div className={styles.twoColumns}>
                  <label>
                    <span>피해</span>
                    <input
                      maxLength={80}
                      value={draft.resultDamage}
                      onChange={(event) =>
                        setDraft({ ...draft, resultDamage: event.target.value })
                      }
                      placeholder="10 물리"
                    />
                  </label>
                  <label>
                    <span>효과</span>
                    <input
                      maxLength={120}
                      value={draft.resultEffect}
                      onChange={(event) =>
                        setDraft({ ...draft, resultEffect: event.target.value })
                      }
                    />
                  </label>
                </div>
                <label>
                  <span>태그 (쉼표 구분)</span>
                  <input
                    value={draft.resultTags}
                    onChange={(event) =>
                      setDraft({ ...draft, resultTags: event.target.value })
                    }
                  />
                </label>
                <div className={styles.imageFields}>
                  <label>
                    <span>결과 이미지 URL</span>
                    <input
                      maxLength={500}
                      value={draft.resultPreviewImage}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          resultPreviewImage: event.target.value,
                        })
                      }
                      placeholder="정확한 결과 이미지가 있을 때만 입력"
                    />
                  </label>
                  <label className={styles.fileInput}>
                    <span>결과 이미지 업로드</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={!blobUploadEnabled || uploading}
                      onChange={(event) =>
                        void uploadImage(event.target.files?.[0])
                      }
                    />
                    <small>
                      {blobUploadEnabled
                        ? "PNG/JPEG/WebP · 최대 5MB"
                        : "Blob 미설정 · URL 직접 입력 사용"}
                    </small>
                  </label>
                  {draft.resultPreviewImage ? (
                    <span className={styles.resultPreview}>
                      <Image
                        src={draft.resultPreviewImage}
                        alt="결과 장비 미리보기"
                        fill
                        sizes="240px"
                        unoptimized
                      />
                    </span>
                  ) : (
                    <p className={styles.emptyHint}>
                      결과 이미지 없음 · 원본 이미지는 자동 상속하지 않습니다.
                    </p>
                  )}
                </div>

                <details className={styles.actionEditor} open={Boolean(draft.actionCode)}>
                  <summary>장비 액션 (EQUIPMENT ACTION, 선택)</summary>
                  <div className={styles.twoColumns}>
                    <label>
                      <span>액션 코드</span>
                      <input
                        maxLength={3}
                        value={draft.actionCode}
                        onChange={(event) =>
                          setDraft({ ...draft, actionCode: event.target.value })
                        }
                        placeholder="U1"
                      />
                    </label>
                    <label>
                      <span>액션명</span>
                      <input
                        maxLength={80}
                        value={draft.actionName}
                        onChange={(event) =>
                          setDraft({ ...draft, actionName: event.target.value })
                        }
                      />
                    </label>
                  </div>
                  <label>
                    <span>액션 설명</span>
                    <textarea
                      maxLength={500}
                      rows={3}
                      value={draft.actionDescription}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          actionDescription: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>액션 효과</span>
                    <textarea
                      maxLength={1000}
                      rows={6}
                      value={draft.actionEffect}
                      onChange={(event) =>
                        setDraft({ ...draft, actionEffect: event.target.value })
                      }
                    />
                  </label>
                  <div className={styles.twoColumns}>
                    <label>
                      <span>최대 충전</span>
                      <input
                        type="number"
                        min="1"
                        max="99"
                        step="1"
                        value={draft.actionMaxCharges}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            actionMaxCharges: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      <span>GM 승인 재장전 비용</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={draft.actionReloadCreditCost}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            actionReloadCreditCost: event.target.value,
                          })
                        }
                      />
                    </label>
                  </div>
                </details>

                <label>
                  <span>내부 메모 (플레이어 비공개)</span>
                  <textarea
                    maxLength={1000}
                    rows={3}
                    value={draft.internalNote}
                    onChange={(event) =>
                      setDraft({ ...draft, internalNote: event.target.value })
                    }
                  />
                </label>
              </Box>

              <Box className={styles.section}>
                <Eyebrow>6 · 최종 검토·견적 발행</Eyebrow>
                <div className={styles.costSummary}>
                  <div>
                    <span>재료 조달가</span>
                    <strong>{materialCost.toLocaleString()} CR</strong>
                  </div>
                  <div>
                    <span>공임</span>
                    <strong>{(Number(draft.creditCost) || 0).toLocaleString()} CR</strong>
                  </div>
                  <div data-total>
                    <span>총 경제 부담</span>
                    <strong>{totalCost.toLocaleString()} CR</strong>
                  </div>
                  <div>
                    <span>제작 시간</span>
                    <strong>{formatDuration(Number(draft.durationMinutes))}</strong>
                  </div>
                </div>
                <div className={styles.diffGrid}>
                  {sourceResultDiff.map((row) => (
                    <div key={row.label}>
                      <strong>{row.label}</strong>
                      <span>{row.before}</span>
                      <span>→ {row.after}</span>
                    </div>
                  ))}
                </div>
                <p className={styles.policyNote}>
                  경량 개조 {WORKSHOP_COST_POLICY.utilityCreditRange[0]}~{WORKSHOP_COST_POLICY.utilityCreditRange[1]} CR · 액션 부여 희귀 재료 + 재료가 20~40% · 상위 강화 희귀 재료 + {WORKSHOP_COST_POLICY.advancedCreditRange[0].toLocaleString()}~{WORKSHOP_COST_POLICY.advancedCreditRange[1].toLocaleString()} CR
                </p>
                <button
                  className={styles.primaryAction}
                  type="submit"
                  disabled={
                    quoteMutation.isPending ||
                    uploading ||
                    missingMaterials.length > 0 ||
                    !selectedBlueprintCompatible
                  }
                >
                  {quoteMutation.isPending
                    ? "견적 발행 중"
                    : selected.quote
                      ? "수정 견적 발행"
                      : "견적 발행"}
                </button>
                <p className={styles.emptyHint}>
                  견적 발행은 설계 스냅샷만 저장합니다. 실제 결과 장비는 의뢰인이 제작 완료 후 수령할 때 생성됩니다.
                </p>
              </Box>
            </form>
          ) : null}

          <Box className={styles.operations}>
            <Eyebrow>7 · 운영 처리 (OPERATIONS)</Eyebrow>
            <p>
              현재 상태: <strong>{readyLabel}</strong>
            </p>
            <label>
              <span>운영 메모 / 반려·취소 사유</span>
              <textarea
                maxLength={1000}
                rows={3}
                value={operatorNote}
                onChange={(event) => setOperatorNote(event.target.value)}
              />
            </label>
            <div className={styles.operationActions}>
              {selected.status === "REQUESTED" ? (
                <button
                  type="button"
                  onClick={() => updateStatus("IN_REVIEW")}
                >
                  검토 시작
                </button>
              ) : null}
              {selected.kind === "reload" &&
              ["REQUESTED", "IN_REVIEW", "APPROVED"].includes(
                selected.status,
              ) ? (
                <button
                  className={styles.approveAction}
                  type="button"
                  disabled={approveReloadMutation.isPending}
                  onClick={() =>
                    approveReloadMutation.mutate(
                      { requestId: selected._id },
                      {
                        onSuccess: () =>
                          setFeedback({
                            tone: "success",
                            text: `${selected.reload?.creditCost.toLocaleString() ?? "0"} CR 결제와 충전 복구를 한 트랜잭션으로 승인했습니다.`,
                          }),
                        onError: (error) =>
                          setFeedback({
                            tone: "error",
                            text: errorMessage(error),
                          }),
                      },
                    )
                  }
                >
                  관료 결재 승인·재장전
                </button>
              ) : null}
            </div>
            <details className={styles.dangerZone}>
              <summary>반려·제작 취소</summary>
              <p>경제 상태를 변경하는 명령입니다. 사유 입력 후 실행하세요.</p>
              <div className={styles.operationActions}>
                {["REQUESTED", "IN_REVIEW", "APPROVED", "QUOTED"].includes(
                  selected.status,
                ) ? (
                  <button
                    type="button"
                    disabled={!operatorNote.trim()}
                    onClick={() => updateStatus("REJECTED")}
                  >
                    요청 반려
                  </button>
                ) : null}
                {selected.status === "IN_PROGRESS" ? (
                  <button
                    type="button"
                    disabled={!operatorNote.trim() || cancelMutation.isPending}
                    onClick={() =>
                      cancelMutation.mutate(
                        {
                          requestId: selected._id,
                          note: operatorNote.trim(),
                        },
                        {
                          onSuccess: () =>
                            setFeedback({
                              tone: "success",
                              text: "비용과 에스크로 물품을 반환하고 제작을 취소했습니다.",
                            }),
                          onError: (error) =>
                            setFeedback({
                              tone: "error",
                              text: errorMessage(error),
                            }),
                        },
                      )
                    }
                  >
                    제작 취소·전액 복구
                  </button>
                ) : null}
              </div>
            </details>
          </Box>

          {feedback ? (
            <p
              className={styles.feedback}
              data-tone={feedback.tone}
              role="status"
            >
              {feedback.text}
            </p>
          ) : null}
        </main>
      </div>
    </div>
  );
}
