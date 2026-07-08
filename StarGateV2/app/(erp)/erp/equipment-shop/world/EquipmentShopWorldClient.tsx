"use client";

import { useState } from "react";

import styles from "./page.module.css";
import ZoneHud from "./ZoneHud";
import WorldStage2D, {
  ARMORY_STAGE_PLAYER_START,
  getArmoryStagePointForZone,
  type ArmoryStagePoint,
} from "./WorldStage2D";
import {
  DEFAULT_ARMORY_WORLD_ZONE,
  type ArmoryTravelRequest,
  type ArmoryWorldZoneKey,
} from "./world-zones";

export default function EquipmentShopWorldClient() {
  const [selectedZoneKey, setSelectedZoneKey] =
    useState<ArmoryWorldZoneKey>(DEFAULT_ARMORY_WORLD_ZONE);
  const [activeZoneKey, setActiveZoneKey] =
    useState<ArmoryWorldZoneKey | null>(null);
  const [player, setPlayer] =
    useState<ArmoryStagePoint>(ARMORY_STAGE_PLAYER_START);

  const handleStageMove = (
    point: ArmoryStagePoint,
    zoneKey: ArmoryWorldZoneKey | null,
  ) => {
    setPlayer(point);
    setActiveZoneKey(zoneKey);
    if (zoneKey) setSelectedZoneKey(zoneKey);
  };

  const handleZoneTravel = (zoneKey: ArmoryWorldZoneKey) => {
    setSelectedZoneKey(zoneKey);
    setActiveZoneKey(zoneKey);
    setPlayer(getArmoryStagePointForZone(zoneKey));
  };

  const handleTravelRequest = (request: ArmoryTravelRequest) => {
    handleZoneTravel(request.zoneKey);
  };

  return (
    <main className={styles.worldRoot} aria-label="병기부 2.5D 월드 허브">
      <div className={styles.worldStage}>
        <WorldStage2D
          activeZoneKey={activeZoneKey}
          player={player}
          onStageMove={handleStageMove}
          onZoneTravel={handleZoneTravel}
        />
        <ZoneHud
          activeZoneKey={activeZoneKey}
          selectedZoneKey={selectedZoneKey}
          onTravelRequest={handleTravelRequest}
          onSelectZone={setSelectedZoneKey}
        />
      </div>
    </main>
  );
}
