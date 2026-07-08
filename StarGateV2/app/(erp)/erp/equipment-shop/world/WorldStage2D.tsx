"use client";

import Image from "next/image";
import {
  useCallback,
  useMemo,
  type CSSProperties,
  type PointerEvent,
} from "react";

import styles from "./page.module.css";
import {
  ARMORY_WORLD_ZONES,
  getArmoryWorldZone,
  type ArmoryWorldZoneKey,
} from "./world-zones";

interface WorldStage2DProps {
  activeZoneKey: ArmoryWorldZoneKey | null;
  player: ArmoryStagePoint;
  onStageMove: (
    point: ArmoryStagePoint,
    zoneKey: ArmoryWorldZoneKey | null,
  ) => void;
  onZoneTravel: (zoneKey: ArmoryWorldZoneKey) => void;
}

export interface ArmoryStagePoint {
  x: number;
  y: number;
}

interface ZoneHotspot extends ArmoryStagePoint {
  width: number;
  height: number;
}

const ARMORY_RECEPTION_BACKGROUND =
  "/assets/equipment-shop/world/armory-reception-lobby.png";

export const ARMORY_STAGE_PLAYER_START: ArmoryStagePoint = {
  x: 50.2,
  y: 69.4,
};

const ZONE_HOTSPOTS: Record<ArmoryWorldZoneKey, ZoneHotspot> = {
  lab: { x: 33.3, y: 43.0, width: 10.6, height: 7.4 },
  towaski: { x: 79.7, y: 38.0, width: 9.6, height: 6.4 },
  acheron: { x: 80.0, y: 48.4, width: 9.8, height: 6.4 },
  strategic: { x: 88.4, y: 52.0, width: 10.8, height: 6.6 },
  custom: { x: 88.0, y: 60.9, width: 9.6, height: 6.4 },
  simulator: { x: 88.0, y: 69.1, width: 9.6, height: 6.4 },
};

function clampPercent(value: number): number {
  return Math.min(96, Math.max(4, value));
}

export function getArmoryStagePointForZone(
  zoneKey: ArmoryWorldZoneKey,
): ArmoryStagePoint {
  const hotspot = ZONE_HOTSPOTS[zoneKey];
  return {
    x: hotspot.x,
    y: Math.min(92, hotspot.y + hotspot.height * 0.58),
  };
}

function getZoneAtPoint(point: ArmoryStagePoint): ArmoryWorldZoneKey | null {
  const zone = ARMORY_WORLD_ZONES.find(({ key }) => {
    const hotspot = ZONE_HOTSPOTS[key];
    const halfWidth = hotspot.width / 2;
    const halfHeight = hotspot.height / 2;

    return (
      point.x >= hotspot.x - halfWidth &&
      point.x <= hotspot.x + halfWidth &&
      point.y >= hotspot.y - halfHeight &&
      point.y <= hotspot.y + halfHeight + 5
    );
  });

  return zone?.key ?? null;
}

export default function WorldStage2D({
  activeZoneKey,
  player,
  onStageMove,
  onZoneTravel,
}: WorldStage2DProps) {
  const activeZone = useMemo(
    () => (activeZoneKey ? getArmoryWorldZone(activeZoneKey) : null),
    [activeZoneKey],
  );

  const moveToZone = useCallback(
    (zoneKey: ArmoryWorldZoneKey) => {
      onZoneTravel(zoneKey);
    },
    [onZoneTravel],
  );

  const handleStagePointer = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;

      const rect = event.currentTarget.getBoundingClientRect();
      const nextPoint = {
        x: clampPercent(((event.clientX - rect.left) / rect.width) * 100),
        y: clampPercent(((event.clientY - rect.top) / rect.height) * 100),
      };
      const zoneKey = getZoneAtPoint(nextPoint);

      onStageMove(nextPoint, zoneKey);
    },
    [onStageMove],
  );

  const playerStyle = {
    left: `${player.x}%`,
    top: `${player.y}%`,
    "--player-scale": String(0.78 + player.y / 250),
  } as CSSProperties;

  return (
    <section className={styles.worldStage2d} aria-label="병기부 2.5D 월드 허브">
      <div
        className={styles.worldBackdropPlane}
        onPointerDown={handleStagePointer}
      >
        <Image
          src={ARMORY_RECEPTION_BACKGROUND}
          alt="NOVUS ORDO 병기부 안내데스크 로비"
          fill
          priority
          sizes="100vw"
          className={styles.worldBackdropImage}
        />
        <div className={styles.worldBackdropShade} aria-hidden="true" />

        {ARMORY_WORLD_ZONES.map((zone) => {
          const hotspot = ZONE_HOTSPOTS[zone.key];
          const isActive = zone.key === activeZoneKey;
          const hotspotStyle = {
            left: `${hotspot.x}%`,
            top: `${hotspot.y}%`,
            width: `${hotspot.width}%`,
            minHeight: `${hotspot.height}%`,
            "--zone-color": zone.color,
            "--zone-accent": zone.accent,
          } as CSSProperties;

          return (
            <button
              key={zone.key}
              type="button"
              className={[
                styles.worldHotspot,
                isActive ? styles["worldHotspot--active"] : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={hotspotStyle}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => moveToZone(zone.key)}
            >
              <span>{zone.eyebrow}</span>
              <strong>{zone.title}</strong>
            </button>
          );
        })}

        <div className={styles.worldPlayer} style={playerStyle} aria-hidden="true">
          {activeZone ? (
            <div className={styles.worldPlayer__bubble}>
              <strong>{activeZone.npc}</strong>
              <span>진입 가능</span>
            </div>
          ) : null}
          <span className={styles.worldPlayer__shadow} />
          <span className={styles.worldPlayer__body} />
          <span className={styles.worldPlayer__head} />
          <span className={styles.worldPlayer__visor} />
        </div>
      </div>
    </section>
  );
}
