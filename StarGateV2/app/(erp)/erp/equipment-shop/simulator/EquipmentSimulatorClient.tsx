"use client";

import Image from "next/image";
import Link from "next/link";
import { type CSSProperties, type PointerEvent, useMemo, useState } from "react";

import type {
  EquipmentShopCatalogEntry,
  EquipmentShopCatalogResponse,
} from "@/hooks/queries/useEquipmentShopQuery";

import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import PageHead from "@/components/ui/PageHead/PageHead";
import Tag from "@/components/ui/Tag/Tag";

import { formatCredits } from "@/lib/format/credit";

import styles from "./page.module.css";

type Distance = "near" | "mid" | "far";
type AimPoint = { x: number; y: number };
type SimLog = {
  id: number;
  text: string;
  tone: "hit" | "miss" | "info";
};

type DamageProfile = {
  label: string;
  amount: number;
  type: string;
};

type EquipmentRule = {
  role: "냉병기" | "화기" | "설치화기" | "특수화기";
  ranges: Partial<Record<Distance, DamageProfile>>;
  ammoMax?: number;
  chargeMax?: number;
  tolerance: Record<Distance, number>;
  cadence: string;
};

const DISTANCES: Array<{ value: Distance; label: string }> = [
  { value: "near", label: "근거리" },
  { value: "mid", label: "중거리" },
  { value: "far", label: "장거리" },
];

const EQUIPMENT_RULES: Record<string, EquipmentRule> = {
  "basic-dagger": {
    role: "냉병기",
    ranges: {
      near: { label: "근거리", amount: 5, type: "물리" },
      mid: { label: "중거리", amount: 5, type: "물리" },
    },
    tolerance: { near: 30, mid: 22, far: 0 },
    cadence: "회수 가능",
  },
  "basic-katana": {
    role: "냉병기",
    ranges: {
      near: { label: "근거리", amount: 10, type: "물리" },
    },
    tolerance: { near: 28, mid: 0, far: 0 },
    cadence: "근접",
  },
  "basic-longsword": {
    role: "냉병기",
    ranges: {
      near: { label: "근거리", amount: 10, type: "물리" },
    },
    tolerance: { near: 28, mid: 0, far: 0 },
    cadence: "근접",
  },
  "basic-blunt-weapon": {
    role: "냉병기",
    ranges: {
      near: { label: "근거리", amount: 10, type: "물리" },
    },
    tolerance: { near: 26, mid: 0, far: 0 },
    cadence: "근접",
  },
  "basic-chainsaw": {
    role: "냉병기",
    ranges: {
      near: { label: "근거리", amount: 15, type: "물리" },
    },
    chargeMax: 5,
    tolerance: { near: 24, mid: 0, far: 0 },
    cadence: "5회",
  },
  "basic-pistol": {
    role: "화기",
    ranges: {
      near: { label: "근거리", amount: 7, type: "물리" },
      mid: { label: "중거리", amount: 5, type: "물리" },
    },
    ammoMax: 5,
    tolerance: { near: 24, mid: 18, far: 0 },
    cadence: "5/5",
  },
  "basic-assault-rifle": {
    role: "화기",
    ranges: {
      near: { label: "근거리", amount: 5, type: "물리" },
      mid: { label: "중거리", amount: 10, type: "물리" },
      far: { label: "장거리", amount: 7, type: "물리" },
    },
    ammoMax: 6,
    tolerance: { near: 22, mid: 20, far: 15 },
    cadence: "6/6",
  },
  "basic-shotgun": {
    role: "화기",
    ranges: {
      near: { label: "근거리", amount: 15, type: "물리" },
      mid: { label: "중거리", amount: 5, type: "물리" },
    },
    ammoMax: 4,
    tolerance: { near: 32, mid: 20, far: 0 },
    cadence: "4/4",
  },
  "basic-heavy-machine-gun": {
    role: "설치화기",
    ranges: {
      mid: { label: "중거리", amount: 15, type: "물리" },
      far: { label: "원거리", amount: 10, type: "물리" },
    },
    ammoMax: 10,
    tolerance: { near: 0, mid: 22, far: 18 },
    cadence: "10/10",
  },
  "basic-sniper-rifle": {
    role: "화기",
    ranges: {
      far: { label: "장거리", amount: 20, type: "물리" },
    },
    ammoMax: 3,
    tolerance: { near: 0, mid: 0, far: 12 },
    cadence: "3/3",
  },
  "basic-flamethrower": {
    role: "특수화기",
    ranges: {
      near: { label: "근거리", amount: 10, type: "화염" },
      mid: { label: "중거리", amount: 8, type: "화염" },
    },
    ammoMax: 4,
    tolerance: { near: 30, mid: 24, far: 0 },
    cadence: "4/4",
  },
  "basic-sonic-emitter": {
    role: "특수화기",
    ranges: {
      mid: { label: "중거리", amount: 15, type: "소리" },
      far: { label: "장거리", amount: 3, type: "소리" },
    },
    ammoMax: 3,
    tolerance: { near: 0, mid: 20, far: 18 },
    cadence: "3/3",
  },
};

const FALLBACK_RULE: EquipmentRule = {
  role: "화기",
  ranges: {},
  tolerance: { near: 18, mid: 16, far: 12 },
  cadence: "등록값",
};

interface Props {
  initialCatalog: EquipmentShopCatalogResponse;
}

function ammoStateFor(slug: string): number {
  const rule = EQUIPMENT_RULES[slug];
  return rule?.ammoMax ?? rule?.chargeMax ?? 0;
}

function clampPercent(value: number): number {
  return Math.max(4, Math.min(96, value));
}

function aimError(aim: AimPoint): number {
  return Math.hypot(aim.x - 50, aim.y - 50);
}

function sortedSimulatorItems(
  items: EquipmentShopCatalogEntry[],
): EquipmentShopCatalogEntry[] {
  return items
    .filter((item) => item.category === "WEAPON")
    .sort((a, b) => {
      const zoneOrder = a.zone.localeCompare(b.zone, "ko");
      if (zoneOrder !== 0) return zoneOrder;
      return a.name.localeCompare(b.name, "ko");
    });
}

export default function EquipmentSimulatorClient({ initialCatalog }: Props) {
  const simulatorItems = useMemo(
    () => sortedSimulatorItems(initialCatalog.items),
    [initialCatalog.items],
  );
  const [selectedSlug, setSelectedSlug] = useState("basic-pistol");
  const [distance, setDistance] = useState<Distance>("mid");
  const [aim, setAim] = useState<AimPoint>({ x: 50, y: 50 });
  const [ammoBySlug, setAmmoBySlug] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      Object.keys(EQUIPMENT_RULES).map((slug) => [slug, ammoStateFor(slug)]),
    ),
  );
  const [targetIntegrity, setTargetIntegrity] = useState(100);
  const [heat, setHeat] = useState(0);
  const [sequence, setSequence] = useState(1);
  const [logs, setLogs] = useState<SimLog[]>([
    { id: 0, text: "시험장 대기", tone: "info" },
  ]);

  const selectedItem =
    simulatorItems.find((item) => item.slug === selectedSlug) ??
    simulatorItems[0] ??
    null;
  const selectedKey = selectedItem?.slug ?? selectedItem?.key ?? "";
  const selectedRule = selectedKey
    ? EQUIPMENT_RULES[selectedKey] ?? FALLBACK_RULE
    : FALLBACK_RULE;
  const selectedAmmo = selectedKey ? (ammoBySlug[selectedKey] ?? 0) : 0;
  const selectedProfile = selectedRule.ranges[distance];
  const selectedTolerance = selectedRule.tolerance[distance] ?? 0;
  const currentAimError = aimError(aim);
  const aimQuality = Math.max(0, Math.round(100 - currentAimError * 2));
  const hasAmmoSystem =
    selectedRule.ammoMax !== undefined || selectedRule.chargeMax !== undefined;
  const ammoLabel =
    selectedRule.chargeMax !== undefined ? "시동" : selectedRule.ammoMax ? "탄환" : "운용";
  const maxAmmo = selectedRule.ammoMax ?? selectedRule.chargeMax ?? 0;

  const stageStyle = {
    "--aim-x": `${aim.x}%`,
    "--aim-y": `${aim.y}%`,
    "--weapon-angle": `${(aim.x - 50) / 4}deg`,
    "--weapon-lift": `${(50 - aim.y) / 6}px`,
  } as CSSProperties;

  function pushLog(text: string, tone: SimLog["tone"]) {
    setLogs((prev) => [{ id: sequence, text, tone }, ...prev].slice(0, 6));
    setSequence((prev) => prev + 1);
  }

  function handleTargetPointer(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    setAim({ x: clampPercent(x), y: clampPercent(y) });
  }

  function handleSelect(item: EquipmentShopCatalogEntry) {
    setSelectedSlug(item.slug ?? item.key);
    setHeat(0);
  }

  function handleReload() {
    if (!selectedKey || !hasAmmoSystem) return;
    setAmmoBySlug((prev) => ({ ...prev, [selectedKey]: maxAmmo }));
    setHeat(0);
    pushLog(
      selectedRule.chargeMax !== undefined ? "재시동 완료" : "장전 완료",
      "info",
    );
  }

  function handleResetTarget() {
    setTargetIntegrity(100);
    setAim({ x: 50, y: 50 });
    setHeat(0);
    pushLog("표적 리셋", "info");
  }

  function handleFire() {
    if (!selectedItem || !selectedKey) return;
    if (hasAmmoSystem && selectedAmmo <= 0) {
      pushLog(
        selectedRule.chargeMax !== undefined ? "재시동 필요" : "탄환 없음",
        "miss",
      );
      return;
    }
    if (hasAmmoSystem) {
      setAmmoBySlug((prev) => ({
        ...prev,
        [selectedKey]: Math.max(0, (prev[selectedKey] ?? 0) - 1),
      }));
    }

    if (!selectedProfile || selectedTolerance <= 0) {
      setHeat((prev) => Math.min(100, prev + 8));
      pushLog(`${DISTANCES.find((d) => d.value === distance)?.label} 판정 불가`, "miss");
      return;
    }

    const hit = currentAimError <= selectedTolerance;
    setHeat((prev) => Math.min(100, prev + (hit ? 14 : 9)));

    if (!hit) {
      pushLog(`${selectedItem.name} 빗나감 · 조준 ${aimQuality}%`, "miss");
      return;
    }

    setTargetIntegrity((prev) =>
      Math.max(0, prev - selectedProfile.amount),
    );
    pushLog(
      `${selectedProfile.label} 적중 · ${selectedProfile.amount} ${selectedProfile.type}`,
      "hit",
    );
  }

  return (
    <div className={styles.simRoot} data-pixel-font="full">
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "병기부", href: "/erp/equipment-shop" },
          { label: "장비 시뮬레이터" },
        ]}
        title="장비 시뮬레이터"
      />

      <section className={styles.simStage} style={stageStyle}>
        <header className={styles.stageHeader}>
          <div>
            <Eyebrow>TEST RANGE</Eyebrow>
            <h1>{selectedItem?.name ?? "장비 없음"}</h1>
          </div>
          <Tag tone="gold">GM PREVIEW</Tag>
          <Link href="/erp/equipment-shop" className={styles.backLink}>
            병기부
          </Link>
        </header>

        <div className={styles.simLayout}>
          <aside className={styles.catalogPanel} aria-label="장비 선택">
            <div className={styles.panelIntro}>
              <Eyebrow>CATALOG</Eyebrow>
              <strong>장비 선택</strong>
            </div>
            <div className={styles.itemRail}>
              {simulatorItems.map((item) => {
                const key = item.slug ?? item.key;
                const active = selectedItem?.key === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={[
                      styles.itemButton,
                      active ? styles["itemButton--active"] : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => handleSelect(item)}
                  >
                    <span className={styles.itemThumb}>
                      {item.previewImage ? (
                        <Image
                          src={item.previewImage}
                          width={48}
                          height={48}
                          alt=""
                          aria-hidden
                          unoptimized
                        />
                      ) : null}
                    </span>
                    <span>
                      <strong>{item.name}</strong>
                      <small>{formatCredits(item.price)}</small>
                    </span>
                    <em>{EQUIPMENT_RULES[key]?.role ?? item.category}</em>
                  </button>
                );
              })}
            </div>
          </aside>

          <main className={styles.rangePanel} aria-label="시험장">
            <div className={styles.viewport} onPointerDown={handleTargetPointer}>
              <div className={styles.rangeGrid} aria-hidden />
              <div className={styles.target} aria-hidden>
                <span />
              </div>
              <div className={styles.crosshair} aria-hidden />
              <div className={styles.weaponRig} aria-hidden>
                {selectedItem?.previewImage ? (
                  <Image
                    src={selectedItem.previewImage}
                    width={256}
                    height={256}
                    alt=""
                    priority
                    unoptimized
                  />
                ) : null}
              </div>
              <div className={styles.integrityBar} aria-label="표적 내구도">
                <span style={{ width: `${targetIntegrity}%` }} />
              </div>
            </div>

            <section className={styles.consolePanel} aria-label="조작 패널">
              <div className={styles.distanceTabs} role="tablist" aria-label="사거리">
                {DISTANCES.map((item) => {
                  const active = distance === item.value;
                  const enabled =
                    selectedRule.ranges[item.value] !== undefined &&
                    (selectedRule.tolerance[item.value] ?? 0) > 0;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      className={[
                        styles.distanceButton,
                        active ? styles["distanceButton--active"] : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => setDistance(item.value)}
                    >
                      {item.label}
                      <span>{enabled ? "ON" : "OFF"}</span>
                    </button>
                  );
                })}
              </div>

              <div className={styles.readoutGrid}>
                <div>
                  <span>피해</span>
                  <strong>
                    {selectedProfile
                      ? `${selectedProfile.amount} ${selectedProfile.type}`
                      : "--"}
                  </strong>
                </div>
                <div>
                  <span>{ammoLabel}</span>
                  <strong>
                    {hasAmmoSystem ? `${selectedAmmo}/${maxAmmo}` : "FREE"}
                  </strong>
                </div>
                <div>
                  <span>조준</span>
                  <strong>{aimQuality}%</strong>
                </div>
                <div>
                  <span>열량</span>
                  <strong>{heat}%</strong>
                </div>
              </div>

              <div className={styles.actionRow}>
                <button
                  type="button"
                  className={styles.fireButton}
                  onClick={handleFire}
                  disabled={!selectedItem}
                >
                  발사
                </button>
                <button
                  type="button"
                  className={styles.controlButton}
                  onClick={handleReload}
                  disabled={!hasAmmoSystem}
                >
                  {selectedRule.chargeMax !== undefined ? "재시동" : "장전"}
                </button>
                <button
                  type="button"
                  className={styles.controlButton}
                  onClick={handleResetTarget}
                >
                  표적 리셋
                </button>
              </div>
            </section>
          </main>

          <aside className={styles.telemetryPanel} aria-label="텔레메트리">
            <div className={styles.panelIntro}>
              <Eyebrow>TELEMETRY</Eyebrow>
              <strong>사격 기록</strong>
            </div>
            <div className={styles.specSheet}>
              <div>
                <span>분류</span>
                <strong>{selectedRule.role}</strong>
              </div>
              <div>
                <span>운용</span>
                <strong>{selectedRule.cadence}</strong>
              </div>
              <div>
                <span>내구</span>
                <strong>{targetIntegrity}%</strong>
              </div>
            </div>
            <div className={styles.logList}>
              {logs.map((log) => (
                <div
                  key={log.id}
                  className={[
                    styles.logItem,
                    styles[`logItem--${log.tone}`],
                  ].join(" ")}
                >
                  {log.text}
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
