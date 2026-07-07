"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

import styles from "./page.module.css";
import ZoneHud from "./ZoneHud";
import {
  DEFAULT_ARMORY_WORLD_ZONE,
  type ArmoryTravelRequest,
  type ArmoryWorldZoneKey,
} from "./world-zones";

const WorldScene = dynamic(() => import("./WorldScene"), {
  ssr: false,
  loading: () => (
    <div className={styles.sceneLoading} aria-label="3D 병기부 로딩">
      <span />
      <strong>병기부 월드 로딩 중</strong>
    </div>
  ),
});

export default function EquipmentShopWorldClient() {
  const [selectedZoneKey, setSelectedZoneKey] =
    useState<ArmoryWorldZoneKey>(DEFAULT_ARMORY_WORLD_ZONE);
  const [activeZoneKey, setActiveZoneKey] =
    useState<ArmoryWorldZoneKey | null>(null);
  const [travelRequest, setTravelRequest] =
    useState<ArmoryTravelRequest | null>(null);

  return (
    <main className={styles.worldRoot} aria-label="병기부 3D 월드 허브">
      <div className={styles.worldStage}>
        <WorldScene
          activeZoneKey={activeZoneKey}
          travelRequest={travelRequest}
          onZoneFocus={setActiveZoneKey}
          onSelectZone={setSelectedZoneKey}
        />
        <ZoneHud
          activeZoneKey={activeZoneKey}
          selectedZoneKey={selectedZoneKey}
          onTravelRequest={setTravelRequest}
          onSelectZone={setSelectedZoneKey}
        />
      </div>
    </main>
  );
}
