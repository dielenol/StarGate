"use client";

import Image from "next/image";
import { useState } from "react";

import type { FormEvent } from "react";
import type { ItemCategory, ShopPageGroup } from "@stargate/shared-db";

import { useCreateItem } from "@/hooks/mutations/useInventoryMutation";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import DropdownSelect from "@/components/ui/DropdownSelect/DropdownSelect";
import type { DropdownSelectOption } from "@/components/ui/DropdownSelect/DropdownSelect";
import Input from "@/components/ui/Input/Input";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";

import type {
  ArmoryZone,
  CatalogTarget,
} from "@/lib/shop/catalog-item-input";
import {
  CATALOG_ITEM_PRESETS,
  findCatalogItemPreset,
  getCatalogItemPresetSelectionValue,
  type CatalogItemPresetForm,
} from "@/lib/shop/catalog-presets";

import styles from "./page.module.css";

type FormState = CatalogItemPresetForm;

const INITIAL_FORM: FormState = {
  target: "shop",
  armoryZone: "towaski",
  category: "CONSUMABLE",
  slug: "",
  name: "",
  price: "",
  description: "",
  damage: "",
  effect: "",
  previewImage: "",
  tags: "",
  isAvailable: true,
  isPublic: true,
  stockMin: "1",
  stockMax: "5",
  appearRate: "1",
  pageGroup: "BASIC",
  icon: "◈",
  color: "#d1b25c",
};

const ARMORY_CATEGORY_OPTIONS: Record<
  ArmoryZone,
  readonly ItemCategory[]
> = {
  towaski: ["WEAPON", "ARMOR", "CONSUMABLE"],
  acheron: ["WEAPON", "ARMOR"],
  strategic: ["SPECIAL"],
};

const CATEGORY_LABELS: Record<ItemCategory, string> = {
  WEAPON: "무기",
  ARMOR: "방어구",
  CONSUMABLE: "소모품",
  MATERIAL: "재료",
  SPECIAL: "특수",
};

const PAGE_GROUP_LABELS: Record<ShopPageGroup, string> = {
  BASIC: "기본",
  RECOVERY: "회복",
  LUXURY: "기호",
  RARE: "희귀",
};

const TARGET_OPTIONS: readonly DropdownSelectOption<CatalogTarget>[] = [
  { value: "shop", label: "편의점" },
  { value: "armory", label: "병기부" },
];

const ARMORY_ZONE_OPTIONS: readonly DropdownSelectOption<ArmoryZone>[] = [
  { value: "towaski", label: "토와스키 건샵" },
  { value: "acheron", label: "아케론 대장간" },
  { value: "strategic", label: "전략 장비 보급소" },
];

const PAGE_GROUP_OPTIONS = Object.entries(PAGE_GROUP_LABELS).map(
  ([value, label]) => ({
    value: value as ShopPageGroup,
    label,
  }),
) satisfies readonly DropdownSelectOption<ShopPageGroup>[];

const PRESET_OPTIONS: readonly DropdownSelectOption<string>[] = [
  { value: "", label: "프리셋 없이 직접 입력" },
  ...CATALOG_ITEM_PRESETS.map((preset) => ({
    value: getCatalogItemPresetSelectionValue(preset.key),
    label: `${preset.displayName} · 프리셋`,
    group: preset.form.target === "shop" ? "편의점 프리셋" : "병기부 프리셋",
  })),
];

const SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]{1,79}$/;
const LOCAL_ASSET_PATTERN = /^\/assets\/[a-zA-Z0-9_./-]+$/;
const MAX_CATALOG_PRICE = 1_000_000_000;

function isSafeLocalAssetPath(value: string): boolean {
  if (!LOCAL_ASSET_PATTERN.test(value) || value.includes("//")) return false;
  return !value
    .slice("/assets/".length)
    .split("/")
    .some((segment) => segment === "." || segment === "..");
}

export default function CatalogCreateForm() {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const createItem = useCreateItem();

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleTargetChange(target: CatalogTarget) {
    setSelectedPresetId("");
    setForm((current) => ({
      ...current,
      target,
      category: target === "shop" ? "CONSUMABLE" : "WEAPON",
    }));
    setError("");
    setNotice("");
  }

  function applyPreset(selectionValue: string) {
    setSelectedPresetId(selectionValue);
    const preset = findCatalogItemPreset(selectionValue);
    if (!preset) return;
    setForm({ ...preset.form });
    setError("");
    setNotice("");
  }

  function handleArmoryZoneChange(armoryZone: ArmoryZone) {
    setForm((current) => ({
      ...current,
      armoryZone,
      category: ARMORY_CATEGORY_OPTIONS[armoryZone][0],
    }));
  }

  function validate(): string | null {
    if (!form.name.trim()) return "품목 이름을 입력하세요.";
    if (!SLUG_PATTERN.test(form.slug.trim())) {
      return "slug는 2~80자의 영문 소문자·숫자·하이픈·밑줄만 사용할 수 있습니다.";
    }
    const price = Number(form.price);
    if (
      !Number.isSafeInteger(price) ||
      price <= 0 ||
      price > MAX_CATALOG_PRICE
    ) {
      return `가격은 1~${MAX_CATALOG_PRICE.toLocaleString("ko-KR")} 사이의 정수여야 합니다.`;
    }
    if (
      form.previewImage.trim() &&
      !isSafeLocalAssetPath(form.previewImage.trim())
    ) {
      return "이미지는 /assets/ 아래의 로컬 경로를 입력하세요.";
    }
    if (form.target === "shop") {
      const stockMin = Number(form.stockMin);
      const stockMax = Number(form.stockMax);
      const appearRate = Number(form.appearRate);
      if (
        !Number.isInteger(stockMin) ||
        !Number.isInteger(stockMax) ||
        stockMin < 1 ||
        stockMax < stockMin ||
        stockMax > 999
      ) {
        return "재고 범위는 1~999의 정수이며 최소값이 최대값보다 클 수 없습니다.";
      }
      if (
        !Number.isFinite(appearRate) ||
        appearRate < 0 ||
        appearRate > 1
      ) {
        return "등장률은 0~1 사이여야 합니다.";
      }
    }
    return null;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    const tags = form.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    const common = {
      slug: form.slug.trim(),
      name: form.name.trim(),
      category: form.category,
      price: Number(form.price),
      description: form.description.trim(),
      ...(form.damage.trim() ? { damage: form.damage.trim() } : {}),
      ...(form.effect.trim() ? { effect: form.effect.trim() } : {}),
      ...(form.previewImage.trim()
        ? { previewImage: form.previewImage.trim() }
        : {}),
      ...(tags.length > 0 ? { tags } : {}),
      isAvailable: form.isAvailable,
      isPublic: form.isPublic,
      source: "manual" as const,
    };
    const input =
      form.target === "shop"
        ? {
            ...common,
            target: "shop" as const,
            category: "CONSUMABLE" as const,
            shopMeta: {
              stockMin: Number(form.stockMin),
              stockMax: Number(form.stockMax),
              appearRate: Number(form.appearRate),
              pageGroup: form.pageGroup,
              icon: form.icon.trim() || "◈",
              color: form.color,
            },
          }
        : {
            ...common,
            target: "armory" as const,
            armoryZone: form.armoryZone,
          };

    createItem.mutate(input, {
      onSuccess: () => {
        setSelectedPresetId("");
        setNotice(
          `${form.name.trim()} 품목이 ${form.target === "shop" ? "편의점" : "병기부"} 카탈로그에 등록되었습니다.`,
        );
        setForm((current) => ({
          ...INITIAL_FORM,
          target: current.target,
          armoryZone: current.armoryZone,
          category:
            current.target === "shop"
              ? "CONSUMABLE"
              : ARMORY_CATEGORY_OPTIONS[current.armoryZone][0],
        }));
      },
      onError: (mutationError) => {
        setError(
          mutationError instanceof Error
            ? mutationError.message
            : "품목 등록에 실패했습니다.",
        );
      },
    });
  }

  const categoryOptions =
    form.target === "shop"
      ? (["CONSUMABLE"] as const)
      : ARMORY_CATEGORY_OPTIONS[form.armoryZone];
  const selectedPreset = findCatalogItemPreset(selectedPresetId);
  const selectedPresetImage = selectedPreset?.form.previewImage.trim() ?? "";
  const previewImage = form.previewImage.trim();
  const canPreviewImage =
    previewImage.length > 0 && isSafeLocalAssetPath(previewImage);

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <Box className={styles.panel}>
        <PanelTitle>CATALOG PRESET</PanelTitle>
        <Field id="catalog-preset" label="프리셋 라이브러리" full>
          <DropdownSelect
            id="catalog-preset"
            ariaLabel="카탈로그 프리셋 라이브러리"
            value={selectedPresetId}
            onChange={applyPreset}
            options={PRESET_OPTIONS}
          />
        </Field>
        {selectedPreset ? (
          <div className={styles.presetCard}>
            <div className={styles.presetCard__media}>
              {selectedPresetImage ? (
                <Image
                  className={styles.presetCard__image}
                  src={selectedPresetImage}
                  alt={`${selectedPreset.displayName} 프리셋 이미지`}
                  width={96}
                  height={96}
                />
              ) : (
                <span className={styles.presetCard__empty}>이미지 미지정</span>
              )}
            </div>
            <div className={styles.presetCard__body}>
              <strong>{selectedPreset.displayName}</strong>
              <span>{selectedPreset.summary}</span>
              <small>{selectedPreset.sourceLabel}</small>
            </div>
          </div>
        ) : null}
        <p className={styles.hint}>
          기본 제공 프리셋은 편집 폼만 채웁니다. 모든 값을 수정할 수 있으며
          아래 등록 버튼을 누르기 전에는 품목·재고·웹훅이 생성되지 않습니다.
          편의점과 병기부 프리셋을 같은 라이브러리에서 관리합니다.
        </p>
      </Box>

      <Box className={styles.panel}>
        <PanelTitle>CATALOG DESTINATION</PanelTitle>
        <div className={styles.grid}>
          <Field id="catalog-target" label="판매처">
            <DropdownSelect
              id="catalog-target"
              ariaLabel="판매처"
              value={form.target}
              onChange={handleTargetChange}
              options={TARGET_OPTIONS}
            />
          </Field>

          {form.target === "armory" ? (
            <Field id="armory-zone" label="병기부 존">
              <DropdownSelect
                id="armory-zone"
                ariaLabel="병기부 존"
                value={form.armoryZone}
                onChange={handleArmoryZoneChange}
                options={ARMORY_ZONE_OPTIONS}
              />
            </Field>
          ) : null}

          <Field id="item-category" label="카테고리">
            <DropdownSelect
              id="item-category"
              ariaLabel="카테고리"
              value={form.category}
              onChange={(category) => update("category", category)}
              disabled={form.target === "shop"}
              options={categoryOptions.map((category) => ({
                value: category,
                label: CATEGORY_LABELS[category],
              }))}
            />
          </Field>
        </div>
      </Box>

      <Box className={styles.panel}>
        <PanelTitle>ITEM DETAILS</PanelTitle>
        <div className={styles.grid}>
          <Field id="item-slug" label="slug">
            <Input
              id="item-slug"
              value={form.slug}
              onChange={(event) => update("slug", event.target.value)}
              placeholder="예: field-ration-deluxe"
              required
            />
          </Field>

          <Field id="item-name" label="이름">
            <Input
              id="item-name"
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
              placeholder="품목 이름"
              required
            />
          </Field>

          <Field id="item-price" label="가격 (CR)">
            <Input
              id="item-price"
              type="number"
              min={1}
              max={MAX_CATALOG_PRICE}
              step={1}
              value={form.price}
              onChange={(event) => update("price", event.target.value)}
              placeholder="1"
              required
            />
          </Field>

          <Field id="item-image" label="이미지 (선택)">
            <Input
              id="item-image"
              value={form.previewImage}
              onChange={(event) => update("previewImage", event.target.value)}
              placeholder="/assets/catalog/..."
            />
            <div className={styles.imagePreview} aria-live="polite">
              {canPreviewImage ? (
                <Image
                  className={styles.imagePreview__image}
                  src={previewImage}
                  alt={`${form.name.trim() || "신규 품목"} 이미지 미리보기`}
                  width={96}
                  height={96}
                />
              ) : (
                <span className={styles.imagePreview__empty}>
                  {previewImage ? "이미지 경로 확인 필요" : "이미지 미지정"}
                </span>
              )}
            </div>
          </Field>

          <Field id="item-damage" label="효과·피해 수치 (선택)">
            <Input
              id="item-damage"
              value={form.damage}
              onChange={(event) => update("damage", event.target.value)}
              placeholder="예: 1d8+2"
            />
          </Field>

          <Field id="item-effect" label="효과 설명 (선택)">
            <Input
              id="item-effect"
              value={form.effect}
              onChange={(event) => update("effect", event.target.value)}
              placeholder="사용 또는 장착 효과"
            />
          </Field>

          <Field id="item-tags" label="추가 태그 (쉼표 구분)" full>
            <Input
              id="item-tags"
              value={form.tags}
              onChange={(event) => update("tags", event.target.value)}
              placeholder="존 분류 태그는 서버가 자동 추가합니다."
            />
          </Field>

          <Field id="item-description" label="설명" full>
            <textarea
              id="item-description"
              className={styles.textarea}
              value={form.description}
              onChange={(event) => update("description", event.target.value)}
              placeholder="카탈로그에 표시할 품목 설명"
            />
          </Field>
        </div>
      </Box>

      {form.target === "shop" ? (
        <Box className={styles.panel}>
          <PanelTitle>SHOP STOCK RULE</PanelTitle>
          <div className={styles.grid}>
            <Field id="stock-min" label="최소 재고">
              <Input
                id="stock-min"
                type="number"
                min={1}
                max={999}
                step={1}
                value={form.stockMin}
                onChange={(event) => update("stockMin", event.target.value)}
                required
              />
            </Field>

            <Field id="stock-max" label="최대 재고">
              <Input
                id="stock-max"
                type="number"
                min={1}
                max={999}
                step={1}
                value={form.stockMax}
                onChange={(event) => update("stockMax", event.target.value)}
                required
              />
            </Field>

            <Field id="appear-rate" label="등장률 (0~1)">
              <Input
                id="appear-rate"
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={form.appearRate}
                onChange={(event) => update("appearRate", event.target.value)}
                required
              />
            </Field>

            <Field id="page-group" label="페이지 그룹">
              <DropdownSelect
                id="page-group"
                ariaLabel="페이지 그룹"
                value={form.pageGroup}
                onChange={(pageGroup) => update("pageGroup", pageGroup)}
                options={PAGE_GROUP_OPTIONS}
              />
            </Field>

            <Field id="shop-icon" label="표시 아이콘">
              <Input
                id="shop-icon"
                value={form.icon}
                onChange={(event) => update("icon", event.target.value)}
                maxLength={16}
                placeholder="◈"
              />
            </Field>

            <Field id="shop-color" label="표시 색상">
              <Input
                id="shop-color"
                type="color"
                value={form.color}
                onChange={(event) => update("color", event.target.value)}
              />
            </Field>
          </div>
        </Box>
      ) : null}

      <Box className={styles.panel}>
        <PanelTitle>VISIBILITY</PanelTitle>
        <div className={styles.checks}>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={form.isAvailable}
              onChange={(event) => update("isAvailable", event.target.checked)}
            />
            <span>판매·지급 가능</span>
          </label>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={form.isPublic}
              onChange={(event) => update("isPublic", event.target.checked)}
            />
            <span>플레이어 카탈로그 공개</span>
          </label>
        </div>
        <p className={styles.hint}>
          판매 또는 공개를 끄면 master item은 생성되지만 플레이어 판매
          카탈로그에는 노출되지 않습니다.
        </p>
      </Box>

      {error ? (
        <div className={styles.messageError} role="alert">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className={styles.messageSuccess} role="status">
          {notice}
        </div>
      ) : null}

      <div className={styles.actions}>
        <Button
          type="submit"
          variant="primary"
          disabled={createItem.isPending}
        >
          {createItem.isPending ? "등록 중..." : "신규 품목 등록"}
        </Button>
        <Button as="a" href="/erp/admin">
          관리자 화면
        </Button>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  children,
  full = false,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div
      className={[styles.field, full ? styles["field--full"] : ""]
        .filter(Boolean)
        .join(" ")}
    >
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      {children}
    </div>
  );
}
