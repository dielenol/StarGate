"use client";

import Link from "next/link";
import { useRef } from "react";

import styles from "./page.module.css";
import {
  ARMORY_WORLD_ZONES,
  getArmoryWorldZone,
  type ArmoryTravelRequest,
  type ArmoryWorldZoneKey,
} from "./world-zones";

interface ZoneHudProps {
  activeZoneKey: ArmoryWorldZoneKey | null;
  selectedZoneKey: ArmoryWorldZoneKey;
  onTravelRequest: (request: ArmoryTravelRequest) => void;
  onSelectZone: (zoneKey: ArmoryWorldZoneKey) => void;
}

export default function ZoneHud({
  activeZoneKey,
  selectedZoneKey,
  onTravelRequest,
  onSelectZone,
}: ZoneHudProps) {
  const travelIdRef = useRef(0);
  const displayZone = getArmoryWorldZone(activeZoneKey ?? selectedZoneKey);
  const isInRange = activeZoneKey === displayZone.key;

  const handleTravel = (zoneKey: ArmoryWorldZoneKey) => {
    travelIdRef.current += 1;
    onSelectZone(zoneKey);
    onTravelRequest({ id: travelIdRef.current, zoneKey });
  };

  return (
    <>
      <header className={styles.topHud}>
        <div>
          <span>NOVUS ARMORY WORLD</span>
          <h1>병기부 월드 허브</h1>
        </div>
        <Link href="/erp/equipment-shop">기존 병기부</Link>
      </header>

      <nav className={styles.quickDock} aria-label="병기부 빠른 이동">
        {ARMORY_WORLD_ZONES.map((zone) => (
          <button
            key={zone.key}
            type="button"
            className={[
              styles.quickDock__button,
              styles[`quickDock__button--${zone.key}`],
              zone.key === displayZone.key
                ? styles["quickDock__button--active"]
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => handleTravel(zone.key)}
          >
            <span>{zone.eyebrow}</span>
            <strong>{zone.title}</strong>
          </button>
        ))}
      </nav>

      <aside
        className={[
          styles.zoneHud,
          styles[`zoneHud--${displayZone.key}`],
          isInRange ? styles["zoneHud--ready"] : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-label="현재 병기부 구역"
      >
        <div className={styles.zoneHud__status}>
          <span>{isInRange ? "ACCESS READY" : "NAV TARGET"}</span>
          <strong>{displayZone.title}</strong>
        </div>
        <div className={styles.zoneHud__npc}>
          <span>{displayZone.npc}</span>
          <strong>{displayZone.status}</strong>
        </div>
        <p>{displayZone.detail}</p>
        <Link
          className={
            isInRange
              ? `${styles.zoneHud__enter} ${styles["zoneHud__enter--ready"]}`
              : styles.zoneHud__enter
          }
          href={displayZone.href}
        >
          {isInRange ? "구역 진입" : "해당 구역으로 이동 중"}
        </Link>
      </aside>

      <div className={styles.controlHint} aria-hidden="true">
        <span>클릭·탭 이동</span>
        <span>구역 핫스팟 진입</span>
      </div>
    </>
  );
}
