"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState, type CSSProperties } from "react";

import styles from "./page.module.css";
import {
  ARMORY_WORLD_ZONES,
  DEFAULT_ARMORY_WORLD_ZONE,
  getArmoryWorldZone,
  type ArmoryWorldZoneKey,
} from "./world-zones";

const EquipmentShopWorldScene = dynamic(
  () => import("./EquipmentShopWorldScene"),
  {
    ssr: false,
    loading: () => (
      <div className={styles.sceneLoading} aria-label="3D 병기부 로딩">
        <span />
      </div>
    ),
  },
);

export default function EquipmentShopWorldClient() {
  const [selectedZoneKey, setSelectedZoneKey] =
    useState<ArmoryWorldZoneKey>(DEFAULT_ARMORY_WORLD_ZONE);
  const selectedZone = getArmoryWorldZone(selectedZoneKey);

  return (
    <div className={styles.worldRoot}>
      <div className={styles.worldStage}>
        <EquipmentShopWorldScene
          selectedZoneKey={selectedZoneKey}
          onSelectZone={setSelectedZoneKey}
        />

        <header className={styles.worldHeader}>
          <div>
            <span>ARMORY WORLD PROTOTYPE</span>
            <h1>병기부 작전 구역</h1>
          </div>
          <Link href="/erp/equipment-shop">기존 병기부</Link>
        </header>

        <nav className={styles.zoneDock} aria-label="병기부 구역 선택">
          {ARMORY_WORLD_ZONES.map((zone) => (
            <button
              key={zone.key}
              type="button"
              className={
                zone.key === selectedZoneKey
                  ? `${styles.zoneChip} ${styles["zoneChip--active"]}`
                  : styles.zoneChip
              }
              style={{ "--zone-color": zone.color } as CSSProperties}
              onClick={() => setSelectedZoneKey(zone.key)}
            >
              <span>{zone.eyebrow}</span>
              <strong>{zone.title}</strong>
            </button>
          ))}
        </nav>

        <aside className={styles.briefingPanel} aria-label="선택 구역 정보">
          <div className={styles.briefingTop}>
            <div>
              <span>{selectedZone.eyebrow}</span>
              <strong>{selectedZone.title}</strong>
            </div>
            <i style={{ background: selectedZone.color }} />
          </div>

          <div className={styles.npcSlot}>
            <div className={styles.npcMark} />
            <div>
              <span>AREA NPC</span>
              <strong>{selectedZone.npc}</strong>
            </div>
          </div>

          <dl className={styles.zoneMeta}>
            <div>
              <dt>상태</dt>
              <dd>{selectedZone.status}</dd>
            </div>
            <div>
              <dt>기능</dt>
              <dd>{selectedZone.detail}</dd>
            </div>
          </dl>

          <Link className={styles.enterButton} href={selectedZone.href}>
            구역 진입
          </Link>
        </aside>
      </div>
    </div>
  );
}
