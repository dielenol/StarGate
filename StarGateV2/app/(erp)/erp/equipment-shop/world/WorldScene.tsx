"use client";

import {
  ContactShadows,
  Html,
  OrthographicCamera,
  Preload,
  useGLTF,
} from "@react-three/drei";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { useCallback, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type { Group } from "three";
import { PCFShadowMap, Vector3 } from "three";

import { ARMORY_WORLD_ASSETS, ARMORY_WORLD_GLB_PATHS, ARMORY_WORLD_PROP_ASSETS } from "./assetManifest";
import PlayerController from "./PlayerController";
import styles from "./page.module.css";
import {
  ARMORY_PLAYER_START,
  ARMORY_WORLD_ZONES,
  clampArmoryPoint,
  getArmoryWorldZone,
  type ArmoryMoveRequest,
  type ArmoryTravelRequest,
  type ArmoryWorldAssetKey,
  type ArmoryWorldPoint,
  type ArmoryWorldZone,
  type ArmoryWorldZoneKey,
} from "./world-zones";

interface WorldSceneProps {
  activeZoneKey: ArmoryWorldZoneKey | null;
  travelRequest: ArmoryTravelRequest | null;
  onZoneFocus: (zoneKey: ArmoryWorldZoneKey | null) => void;
  onSelectZone: (zoneKey: ArmoryWorldZoneKey) => void;
}

interface GlbModelProps {
  path: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
}

const START_VECTOR = new Vector3(ARMORY_PLAYER_START.x, 0, ARMORY_PLAYER_START.z);

ARMORY_WORLD_GLB_PATHS.forEach((path) => {
  useGLTF.preload(path);
});

export default function WorldScene({
  activeZoneKey,
  travelRequest,
  onZoneFocus,
  onSelectZone,
}: WorldSceneProps) {
  const playerPositionRef = useRef(START_VECTOR.clone());
  const [moveRequest, setMoveRequest] = useState<ArmoryMoveRequest | null>(null);
  const requestIdRef = useRef(0);

  const requestMove = useCallback((target: ArmoryWorldPoint) => {
    const clamped = clampArmoryPoint(target);
    requestIdRef.current += 1;
    setMoveRequest({
      id: requestIdRef.current,
      target: clamped,
    });
  }, []);

  const requestZoneTravel = useCallback(
    (zoneKey: ArmoryWorldZoneKey) => {
      const zone = getArmoryWorldZone(zoneKey);
      onSelectZone(zoneKey);
      requestMove(zone.approach);
    },
    [onSelectZone, requestMove],
  );

  return (
    <Canvas
      className="armory-world-canvas"
      shadows={{ type: PCFShadowMap }}
      dpr={[1, 1.8]}
      gl={{ antialias: true, alpha: false }}
    >
      <color attach="background" args={["#091011"]} />
      <fog attach="fog" args={["#091011", 13, 22]} />
      <ambientLight intensity={1.35} />
      <directionalLight
        castShadow
        position={[5.4, 8.5, 4.2]}
        intensity={2.2}
        shadow-mapSize-width={1536}
        shadow-mapSize-height={1536}
      />
      <pointLight position={[-5.5, 2.8, -0.6]} intensity={1.3} color="#c9a85a" />
      <pointLight position={[4.8, 2.8, -3.4]} intensity={1.1} color="#8a80d6" />
      <pointLight position={[-3.6, 2.8, -4.2]} intensity={1.05} color="#62bfd2" />

      <OrthographicCamera makeDefault position={[4.8, 5.7, 5.4]} zoom={94} />
      <CameraRig playerPositionRef={playerPositionRef} />

      <ArmoryCampus
        activeZoneKey={activeZoneKey}
        onGroundMove={requestMove}
        onZoneTravel={requestZoneTravel}
      />
      <PlayerController
        moveRequest={moveRequest}
        travelRequest={travelRequest}
        playerPositionRef={playerPositionRef}
        onZoneFocus={onZoneFocus}
      />
      <ContactShadows
        position={[0, 0.02, 0]}
        opacity={0.42}
        scale={16}
        blur={2.6}
        far={5}
      />
      <Preload all />
    </Canvas>
  );
}

function CameraRig({
  playerPositionRef,
}: {
  playerPositionRef: MutableRefObject<Vector3>;
}) {
  const lookAt = useMemo(() => new Vector3(), []);
  const desired = useMemo(() => new Vector3(), []);

  useFrame(({ camera }) => {
    const player = playerPositionRef.current;
    lookAt.lerp(new Vector3(player.x, 0.92, player.z - 0.72), 0.08);
    desired.set(player.x + 4.8, 5.7, player.z + 5.4);
    camera.position.lerp(desired, 0.06);
    camera.lookAt(lookAt);
    camera.updateProjectionMatrix();
  });

  return null;
}

function ArmoryCampus({
  activeZoneKey,
  onGroundMove,
  onZoneTravel,
}: {
  activeZoneKey: ArmoryWorldZoneKey | null;
  onGroundMove: (target: ArmoryWorldPoint) => void;
  onZoneTravel: (zoneKey: ArmoryWorldZoneKey) => void;
}) {
  const handleGroundPointer = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    onGroundMove({ x: event.point.x, z: event.point.z });
  };

  return (
    <group>
      <CampusFloor onPointerDown={handleGroundPointer} />
      <WalkwayNetwork />
      <CentralLobby />
      <BoundaryProps />
      {ARMORY_WORLD_ZONES.map((zone) => (
        <ZoneDistrict
          key={zone.key}
          zone={zone}
          active={zone.key === activeZoneKey}
          onTravel={onZoneTravel}
        />
      ))}
    </group>
  );
}

function CampusFloor({
  onPointerDown,
}: {
  onPointerDown: (event: ThreeEvent<PointerEvent>) => void;
}) {
  return (
    <group>
      <mesh receiveShadow position={[0, -0.08, 0]} onPointerDown={onPointerDown}>
        <boxGeometry args={[20, 0.16, 14.2]} />
        <meshStandardMaterial color="#14201d" roughness={0.86} metalness={0.08} />
      </mesh>
      <mesh receiveShadow position={[0, 0.01, 0]} onPointerDown={onPointerDown}>
        <boxGeometry args={[18.7, 0.05, 12.7]} />
        <meshStandardMaterial color="#1d302c" roughness={0.82} metalness={0.16} />
      </mesh>
      <mesh receiveShadow position={[0, 0.055, 0]} onPointerDown={onPointerDown}>
        <boxGeometry args={[16.2, 0.04, 10.6]} />
        <meshStandardMaterial color="#243b36" roughness={0.9} metalness={0.1} />
      </mesh>
      <mesh position={[0, 0.075, -6.25]}>
        <boxGeometry args={[18.6, 0.06, 0.5]} />
        <meshStandardMaterial
          color="#1a666f"
          emissive="#103c43"
          emissiveIntensity={0.25}
          roughness={0.72}
        />
      </mesh>
      <mesh position={[-8.85, 0.075, 0]}>
        <boxGeometry args={[0.52, 0.06, 12.6]} />
        <meshStandardMaterial
          color="#1a666f"
          emissive="#103c43"
          emissiveIntensity={0.25}
          roughness={0.72}
        />
      </mesh>
    </group>
  );
}

function WalkwayNetwork() {
  return (
    <group position={[0, 0.16, 0]}>
      <mesh receiveShadow>
        <boxGeometry args={[12.4, 0.08, 0.72]} />
        <meshStandardMaterial color="#806b4c" roughness={0.82} metalness={0.06} />
      </mesh>
      <mesh receiveShadow>
        <boxGeometry args={[0.72, 0.08, 9.9]} />
        <meshStandardMaterial color="#806b4c" roughness={0.82} metalness={0.06} />
      </mesh>
      <GlbModel path={ARMORY_WORLD_PROP_ASSETS.pathLong} position={[-3.7, 0.08, 1.7]} scale={0.85} />
      <GlbModel path={ARMORY_WORLD_PROP_ASSETS.pathLong} position={[3.7, 0.08, -1.7]} scale={0.85} rotation={[0, Math.PI, 0]} />
      <GlbModel path={ARMORY_WORLD_PROP_ASSETS.drivewayLong} position={[0, 0.08, 4.4]} scale={0.82} rotation={[0, Math.PI / 2, 0]} />
      <GlbModel path={ARMORY_WORLD_PROP_ASSETS.pathShort} position={[-5.2, 0.08, -3.0]} scale={0.9} rotation={[0, Math.PI / 2, 0]} />
      <GlbModel path={ARMORY_WORLD_PROP_ASSETS.pathShort} position={[4.7, 0.08, -3.0]} scale={0.9} rotation={[0, Math.PI / 2, 0]} />
    </group>
  );
}

function CentralLobby() {
  return (
    <group position={[0, 0.12, 0.26]}>
      <ReceptionHallShell />
      <InformationDesk />
    </group>
  );
}

function ReceptionHallShell() {
  return (
    <group>
      <PolishedLobbyFloor />
      <BackMarbleWall />
      <CeilingRingLight />
      <DirectoryBoard position={[-3.18, 1.08, -0.56]} rotation={0.42} />
      <GlassRoutePylon position={[3.1, 0.62, 0.54]} rotation={-0.32} />
      <HangingBanner position={[-1.72, 1.95, -1.08]} />
      <HangingBanner position={[1.72, 1.95, -1.08]} />
      <PortalSign
        position={[-2.08, 1.1, -1.26]}
        rotation={0.3}
        title="신체증강 연구소"
        subtitle="AUGMENTATION LAB"
        arrow="left"
      />
      <PortalSign
        position={[2.3, 1.02, -1.22]}
        rotation={-0.32}
        title="토와스키 건샵"
        subtitle="TOWASKI GUN SHOP"
        arrow="right"
      />
      <PortalSign
        position={[2.46, 0.62, -1.0]}
        rotation={-0.32}
        title="아케론 대장간"
        subtitle="ACHERON FORGE"
        arrow="right"
      />
      {[-3.14, -1.12, 1.12, 3.14].map((x) => (
        <WallButtress key={x} position={[x, 1.2, -1.42]} />
      ))}
      {[-2.96, 2.96].map((x) => (
        <VerticalLight key={x} position={[x, 1.08, -1.18]} />
      ))}
    </group>
  );
}

function PolishedLobbyFloor() {
  const seamLines = [
    [-1.8, 0, 0.018, 3.9],
    [0, 0, 0.018, 4.2],
    [1.8, 0, 0.018, 3.9],
    [0, -0.92, 4.8, 0.018],
    [0, 0.42, 5.1, 0.018],
    [0, 1.42, 4.4, 0.018],
  ] as const;

  return (
    <group>
      <mesh receiveShadow position={[0, 0.035, 0.18]}>
        <boxGeometry args={[5.9, 0.08, 4.65]} />
        <meshStandardMaterial color="#242524" roughness={0.28} metalness={0.34} />
      </mesh>
      <mesh receiveShadow position={[0, 0.082, 0.18]}>
        <boxGeometry args={[5.42, 0.028, 4.12]} />
        <meshStandardMaterial color="#3d3d39" roughness={0.2} metalness={0.42} />
      </mesh>
      {seamLines.map(([x, z, width, depth]) => (
        <mesh key={`${x}-${z}-${width}-${depth}`} position={[x, 0.106, z]}>
          <boxGeometry args={[width, 0.014, depth]} />
          <meshStandardMaterial
            color="#c9a85a"
            emissive="#5b421b"
            emissiveIntensity={0.12}
            roughness={0.22}
            metalness={0.58}
          />
        </mesh>
      ))}
      <FloorMedallion />
    </group>
  );
}

function FloorMedallion() {
  return (
    <group position={[0, 0.13, 1.2]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh>
        <torusGeometry args={[0.55, 0.018, 8, 48]} />
        <meshStandardMaterial color="#c9a85a" emissive="#5b421b" emissiveIntensity={0.1} />
      </mesh>
      <mesh>
        <torusGeometry args={[0.37, 0.012, 8, 48]} />
        <meshStandardMaterial color="#c9a85a" roughness={0.3} metalness={0.62} />
      </mesh>
      {[0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((rotation) => (
        <mesh key={rotation} rotation={[0, 0, rotation]} position={[0, 0, 0.012]}>
          <boxGeometry args={[0.78, 0.018, 0.014]} />
          <meshStandardMaterial color="#c9a85a" roughness={0.32} metalness={0.58} />
        </mesh>
      ))}
    </group>
  );
}

function BackMarbleWall() {
  const marbleVeins = [
    [-0.86, 0.06, 0.04, 2.34, 0.22],
    [0.74, 0.1, 0.04, 2.05, -0.18],
    [1.22, 0.0, 0.035, 1.35, 0.3],
    [-1.34, 0.0, 0.035, 1.42, -0.28],
  ] as const;

  return (
    <group position={[0, 0, -1.48]}>
      <mesh castShadow receiveShadow position={[0, 1.34, 0]}>
        <boxGeometry args={[3.18, 2.56, 0.18]} />
        <meshStandardMaterial color="#c8c3b7" roughness={0.38} metalness={0.08} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 1.34, -0.08]}>
        <boxGeometry args={[3.48, 2.82, 0.12]} />
        <meshStandardMaterial color="#151717" roughness={0.6} metalness={0.36} />
      </mesh>
      <mesh position={[0, 2.62, 0.06]}>
        <boxGeometry args={[3.34, 0.06, 0.08]} />
        <meshStandardMaterial color="#f0d486" emissive="#6d501e" emissiveIntensity={0.18} />
      </mesh>
      <mesh position={[0, 0.08, 0.06]}>
        <boxGeometry args={[3.34, 0.06, 0.08]} />
        <meshStandardMaterial color="#f0d486" emissive="#6d501e" emissiveIntensity={0.12} />
      </mesh>
      {marbleVeins.map(([x, z, width, height, rotation]) => (
        <mesh
          key={`${x}-${height}`}
          position={[x, 1.28, 0.105 + z]}
          rotation={[0, 0, rotation]}
        >
          <boxGeometry args={[width, height, 0.012]} />
          <meshStandardMaterial color="#858178" roughness={0.5} metalness={0.02} />
        </mesh>
      ))}
      <NovusEmblem3D position={[0, 1.74, 0.13]} scale={0.82} />
      <Html center position={[0, 0.88, 0.17]} className={styles.sceneWallTitle}>
        <strong>NOVUS ORDO</strong>
        <span>병기부</span>
        <small>NOVUS ORDO 산하 기관</small>
      </Html>
    </group>
  );
}

function NovusEmblem3D({
  position,
  scale = 1,
}: {
  position: [number, number, number];
  scale?: number;
}) {
  return (
    <group position={position} scale={scale}>
      <mesh>
        <torusGeometry args={[0.45, 0.014, 8, 54]} />
        <meshStandardMaterial color="#c9a85a" emissive="#6d501e" emissiveIntensity={0.18} />
      </mesh>
      <mesh>
        <torusGeometry args={[0.28, 0.01, 8, 54]} />
        <meshStandardMaterial color="#c9a85a" roughness={0.28} metalness={0.68} />
      </mesh>
      {[0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((rotation) => (
        <mesh key={rotation} rotation={[0, 0, rotation]}>
          <boxGeometry args={[0.72, 0.025, 0.02]} />
          <meshStandardMaterial color="#c9a85a" roughness={0.28} metalness={0.66} />
        </mesh>
      ))}
      <mesh>
        <torusGeometry args={[0.09, 0.012, 8, 32]} />
        <meshStandardMaterial color="#f0d486" emissive="#6d501e" emissiveIntensity={0.12} />
      </mesh>
      {[-0.56, 0.56].map((x) => (
        <group key={x} position={[x, -0.03, 0]} rotation={[0, 0, x > 0 ? -0.44 : 0.44]}>
          {[0, 1, 2, 3, 4].map((index) => (
            <mesh key={index} position={[0, index * 0.07 - 0.14, 0]} rotation={[0, 0, index * 0.08]}>
              <boxGeometry args={[0.2 - index * 0.018, 0.026, 0.016]} />
              <meshStandardMaterial color="#c9a85a" roughness={0.32} metalness={0.58} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function CeilingRingLight() {
  return (
    <group position={[0, 3.02, -1.92]} rotation={[Math.PI / 2, 0, 0]}>
      <mesh>
        <torusGeometry args={[0.72, 0.042, 12, 72]} />
        <meshStandardMaterial
          color="#f5f1df"
          emissive="#f5f1df"
          emissiveIntensity={1.4}
          roughness={0.18}
        />
      </mesh>
      <mesh>
        <torusGeometry args={[0.9, 0.02, 8, 72]} />
        <meshStandardMaterial color="#393632" roughness={0.46} metalness={0.52} />
      </mesh>
      <pointLight position={[0, 0, 0.16]} intensity={1.9} color="#fff3d4" distance={5.2} />
    </group>
  );
}

function WallButtress({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[0.2, 2.35, 0.32]} />
        <meshStandardMaterial color="#17191a" roughness={0.64} metalness={0.44} />
      </mesh>
      <mesh position={[0, 0, 0.18]}>
        <boxGeometry args={[0.075, 2.05, 0.04]} />
        <meshStandardMaterial color="#2f2d29" roughness={0.5} metalness={0.54} />
      </mesh>
      <mesh position={[0, 1.06, 0.2]}>
        <boxGeometry args={[0.24, 0.04, 0.05]} />
        <meshStandardMaterial color="#c9a85a" emissive="#5b421b" emissiveIntensity={0.12} />
      </mesh>
    </group>
  );
}

function VerticalLight({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[0.08, 1.42, 0.035]} />
        <meshStandardMaterial
          color="#fff1d2"
          emissive="#fff1d2"
          emissiveIntensity={1.05}
          roughness={0.2}
        />
      </mesh>
      <pointLight position={[0, 0.1, 0.24]} intensity={0.9} color="#ffe3ad" distance={2.6} />
    </group>
  );
}

function DirectoryBoard({
  position,
  rotation,
}: {
  position: [number, number, number];
  rotation: number;
}) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[0.9, 1.98, 0.1]} />
        <meshStandardMaterial color="#0d0f10" roughness={0.54} metalness={0.42} />
      </mesh>
      <mesh position={[0, 0.02, -0.07]}>
        <boxGeometry args={[0.98, 2.08, 0.06]} />
        <meshStandardMaterial color="#2d2923" roughness={0.42} metalness={0.5} />
      </mesh>
      <mesh position={[0, 0.93, 0.06]}>
        <boxGeometry args={[0.78, 0.035, 0.04]} />
        <meshStandardMaterial color="#f0d486" emissive="#7a5d23" emissiveIntensity={0.24} />
      </mesh>
      <Html center position={[0, 0.05, 0.09]} className={styles.sceneDirectory}>
        <strong>병기부</strong>
        <span>내부 구역 안내</span>
        <ol>
          <li>병기부</li>
          <li>준비중</li>
          <li>신체증강 연구소</li>
          <li>토와스키 건샵</li>
          <li>아케론 대장간</li>
          <li>전략 장비 보급소</li>
        </ol>
      </Html>
    </group>
  );
}

function GlassRoutePylon({
  position,
  rotation,
}: {
  position: [number, number, number];
  rotation: number;
}) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.02, 0]}>
        <boxGeometry args={[0.72, 1.58, 0.08]} />
        <meshPhysicalMaterial
          color="#d9f7ff"
          emissive="#62bfd2"
          emissiveIntensity={0.16}
          transparent
          opacity={0.22}
          roughness={0.08}
          transmission={0.38}
          metalness={0.04}
        />
      </mesh>
      <mesh position={[0, 0.78, 0.06]}>
        <boxGeometry args={[0.66, 0.035, 0.04]} />
        <meshStandardMaterial color="#f0d486" emissive="#7a5d23" emissiveIntensity={0.22} />
      </mesh>
      <mesh position={[0, -0.78, 0.06]}>
        <boxGeometry args={[0.66, 0.035, 0.04]} />
        <meshStandardMaterial color="#f0d486" roughness={0.32} metalness={0.54} />
      </mesh>
      <Html center position={[0, 0.1, 0.1]} className={styles.sceneGlassPanel}>
        <strong>전략 장비 보급소</strong>
        <span>공방</span>
        <span>훈련장</span>
        <small>FLOOR MAP</small>
      </Html>
    </group>
  );
}

function HangingBanner({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[0.44, 1.08, 0.06]} />
        <meshStandardMaterial color="#161515" roughness={0.64} metalness={0.28} />
      </mesh>
      <mesh position={[0, -0.52, 0.035]} rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[0.28, 0.28, 0.035]} />
        <meshStandardMaterial color="#161515" roughness={0.64} metalness={0.28} />
      </mesh>
      <NovusEmblem3D position={[0, 0.16, 0.055]} scale={0.25} />
      <mesh position={[0, -0.3, 0.055]}>
        <boxGeometry args={[0.3, 0.018, 0.018]} />
        <meshStandardMaterial color="#c9a85a" emissive="#5b421b" emissiveIntensity={0.12} />
      </mesh>
    </group>
  );
}

function PortalSign({
  position,
  rotation,
  title,
  subtitle,
  arrow,
}: {
  position: [number, number, number];
  rotation: number;
  title: string;
  subtitle: string;
  arrow: "left" | "right";
}) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[1.0, 0.28, 0.09]} />
        <meshStandardMaterial color="#151718" roughness={0.56} metalness={0.42} />
      </mesh>
      <mesh position={[arrow === "left" ? -0.42 : 0.42, 0, 0.06]}>
        <boxGeometry args={[0.2, 0.035, 0.035]} />
        <meshStandardMaterial color="#c9a85a" emissive="#6d501e" emissiveIntensity={0.2} />
      </mesh>
      <Html center position={[0, 0.01, 0.08]} className={styles.scenePortalSign}>
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </Html>
    </group>
  );
}

function InformationDesk() {
  const hologramRef = useRef<Group>(null);

  useFrame((state) => {
    if (!hologramRef.current) return;
    hologramRef.current.rotation.y = state.clock.elapsedTime * 0.28;
    hologramRef.current.position.y =
      0.92 + Math.sin(state.clock.elapsedTime * 2.4) * 0.018;
  });

  return (
    <group>
      <DeskCounter />
      <group ref={hologramRef} position={[0, 0.94, -0.12]}>
        <HologramCampusMap />
      </group>
      <DeskTerminalCluster />
      <QueueRails />
    </group>
  );
}

function DeskCounter() {
  return (
    <group position={[0, 0.36, 0.08]}>
      <mesh castShadow receiveShadow position={[0, 0.12, 0.16]}>
        <boxGeometry args={[2.24, 0.48, 0.52]} />
        <meshStandardMaterial color="#1a1d1e" roughness={0.52} metalness={0.5} />
      </mesh>
      <mesh castShadow receiveShadow position={[-1.06, 0.08, -0.02]} rotation={[0, 0.28, 0]}>
        <boxGeometry args={[0.72, 0.44, 0.78]} />
        <meshStandardMaterial color="#151718" roughness={0.54} metalness={0.54} />
      </mesh>
      <mesh castShadow receiveShadow position={[1.06, 0.08, -0.02]} rotation={[0, -0.28, 0]}>
        <boxGeometry args={[0.72, 0.44, 0.78]} />
        <meshStandardMaterial color="#151718" roughness={0.54} metalness={0.54} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.39, 0.12]}>
        <boxGeometry args={[2.46, 0.08, 0.64]} />
        <meshStandardMaterial color="#e8e1d1" roughness={0.24} metalness={0.12} />
      </mesh>
      <mesh position={[0, 0.08, 0.45]}>
        <boxGeometry args={[1.76, 0.25, 0.04]} />
        <meshStandardMaterial
          color="#f6f0df"
          emissive="#f6f0df"
          emissiveIntensity={0.56}
          roughness={0.2}
          metalness={0.04}
        />
      </mesh>
      <mesh position={[0, 0.25, 0.49]}>
        <boxGeometry args={[1.94, 0.035, 0.035]} />
        <meshStandardMaterial color="#c9a85a" emissive="#6d501e" emissiveIntensity={0.18} />
      </mesh>
      <Html center position={[0, 0.18, 0.525]} className={styles.sceneDeskFront}>
        <strong>병기부</strong>
        <span>NOVUS ORDO 산하 기관</span>
      </Html>
      <mesh castShadow receiveShadow position={[-1.36, 0.12, 0.18]}>
        <boxGeometry args={[0.28, 0.54, 0.58]} />
        <meshStandardMaterial color="#101213" roughness={0.5} metalness={0.52} />
      </mesh>
      <mesh castShadow receiveShadow position={[1.36, 0.12, 0.18]}>
        <boxGeometry args={[0.28, 0.54, 0.58]} />
        <meshStandardMaterial color="#101213" roughness={0.5} metalness={0.52} />
      </mesh>
      <NovusEmblem3D position={[1.36, 0.24, 0.49]} scale={0.2} />
    </group>
  );
}

function DeskTerminalCluster() {
  return (
    <group>
      <DeskTerminal position={[-0.92, 0.84, 0.05]} rotation={0.18} />
      <DeskTerminal position={[-0.42, 0.86, -0.06]} rotation={0.08} />
      <DeskTerminal position={[0.52, 0.86, -0.04]} rotation={-0.1} />
      <DeskTerminal position={[0.98, 0.84, 0.08]} rotation={-0.22} />
      <mesh position={[0, 0.77, 0.14]}>
        <boxGeometry args={[0.38, 0.08, 0.14]} />
        <meshStandardMaterial color="#151718" roughness={0.48} metalness={0.5} />
      </mesh>
      <Html center position={[0, 0.83, 0.22]} className={styles.sceneDeskPlate}>
        INFORMATION
      </Html>
    </group>
  );
}

function DeskTerminal({
  position,
  rotation,
}: {
  position: [number, number, number];
  rotation: number;
}) {
  return (
    <group position={position} rotation={[0, rotation, -0.1]}>
      <mesh castShadow>
        <boxGeometry args={[0.42, 0.04, 0.24]} />
        <meshStandardMaterial color="#0b0e0f" roughness={0.42} metalness={0.56} />
      </mesh>
      <mesh position={[0, 0.09, -0.08]} rotation={[-0.58, 0, 0]}>
        <boxGeometry args={[0.38, 0.035, 0.24]} />
        <meshPhysicalMaterial
          color="#d9f7ff"
          emissive="#62bfd2"
          emissiveIntensity={0.42}
          transparent
          opacity={0.45}
          roughness={0.08}
          transmission={0.28}
        />
      </mesh>
    </group>
  );
}

function HologramCampusMap() {
  const nodes = [
    [-0.42, -0.1, 0.18, "#c9a85a"],
    [0.44, -0.14, 0.18, "#d46b4a"],
    [-0.34, -0.48, 0.15, "#62bfd2"],
    [0.1, 0.44, 0.15, "#78b05a"],
    [0.42, -0.44, 0.14, "#8a80d6"],
    [-0.28, 0.42, 0.14, "#d9d3bd"],
  ] as const;

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.72, 0.72, 0.02, 32]} />
        <meshPhysicalMaterial
          color="#62bfd2"
          emissive="#235a66"
          emissiveIntensity={0.42}
          transparent
          opacity={0.34}
          roughness={0.18}
          transmission={0.22}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.74, 0.015, 8, 36]} />
        <meshStandardMaterial
          color="#f0d486"
          emissive="#8a6f28"
          emissiveIntensity={0.32}
          roughness={0.34}
        />
      </mesh>
      {nodes.map(([x, z, size, color]) => (
        <mesh key={`${x}-${z}`} castShadow position={[x, 0.06, z]}>
          <boxGeometry args={[size, size * 0.64, size]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.36}
            roughness={0.42}
            metalness={0.12}
          />
        </mesh>
      ))}
      <mesh position={[0, 0.16, 0]}>
        <octahedronGeometry args={[0.16]} />
        <meshStandardMaterial
          color="#a8efff"
          emissive="#62bfd2"
          emissiveIntensity={0.72}
          transparent
          opacity={0.82}
        />
      </mesh>
    </group>
  );
}

function QueueRails() {
  const posts = [
    [-1.36, 0.58],
    [-0.58, 1.02],
    [0.58, 1.02],
    [1.36, 0.58],
  ] as const;

  return (
    <group position={[0, 0.18, 0.88]}>
      {posts.map(([x, z]) => (
        <group key={`${x}-${z}`} position={[x, 0, z]}>
          <mesh castShadow position={[0, 0.28, 0]}>
            <cylinderGeometry args={[0.035, 0.045, 0.56, 8]} />
            <meshStandardMaterial color="#353635" roughness={0.52} metalness={0.44} />
          </mesh>
          <mesh position={[0, 0.59, 0]}>
            <sphereGeometry args={[0.07, 10, 8]} />
            <meshStandardMaterial
              color="#f0d486"
              emissive="#8a6f28"
              emissiveIntensity={0.24}
              roughness={0.36}
            />
          </mesh>
        </group>
      ))}
      <mesh position={[-0.98, 0.52, 0.8]} rotation={[0, 0.64, Math.PI / 2]}>
        <cylinderGeometry args={[0.018, 0.018, 0.82, 8]} />
        <meshStandardMaterial color="#c9a85a" roughness={0.44} metalness={0.24} />
      </mesh>
      <mesh position={[0, 0.52, 1.02]} rotation={[0, Math.PI / 2, Math.PI / 2]}>
        <cylinderGeometry args={[0.018, 0.018, 1.16, 8]} />
        <meshStandardMaterial color="#c9a85a" roughness={0.44} metalness={0.24} />
      </mesh>
      <mesh position={[0.98, 0.52, 0.8]} rotation={[0, -0.64, Math.PI / 2]}>
        <cylinderGeometry args={[0.018, 0.018, 0.82, 8]} />
        <meshStandardMaterial color="#c9a85a" roughness={0.44} metalness={0.24} />
      </mesh>
    </group>
  );
}

function BoundaryProps() {
  const trees = [
    [-8.05, 0.16, -4.7, 0.72],
    [7.85, 0.16, 4.9, 0.74],
    [-7.1, 0.16, 5.2, 0.62],
    [8.0, 0.16, -5.0, 0.62],
  ] as const;

  const lamps = [
    [-6.6, -2.8],
    [-6.2, 2.1],
    [6.2, -2.8],
    [6.6, 2.1],
    [-1.8, -5.1],
    [2.2, 5.25],
  ] as const;

  return (
    <group>
      {trees.map(([x, y, z, scale]) => (
        <GlbModel
          key={`${x}-${z}`}
          path={ARMORY_WORLD_PROP_ASSETS.treeLarge}
          position={[x, y, z]}
          scale={scale}
        />
      ))}
      {lamps.map(([x, z]) => (
        <LampPost key={`${x}-${z}`} position={[x, 0.18, z]} />
      ))}
      <GlbModel path={ARMORY_WORLD_PROP_ASSETS.fenceLow} position={[-7.8, 0.18, 0.4]} scale={[0.72, 0.72, 1.2]} rotation={[0, Math.PI / 2, 0]} />
      <GlbModel path={ARMORY_WORLD_PROP_ASSETS.fenceLow} position={[7.8, 0.18, 0.4]} scale={[0.72, 0.72, 1.2]} rotation={[0, -Math.PI / 2, 0]} />
      <GlbModel path={ARMORY_WORLD_PROP_ASSETS.planter} position={[-0.95, 0.18, 5.3]} scale={0.7} />
      <GlbModel path={ARMORY_WORLD_PROP_ASSETS.planter} position={[1.05, 0.18, -5.3]} scale={0.7} rotation={[0, Math.PI, 0]} />
    </group>
  );
}

function ZoneDistrict({
  zone,
  active,
  onTravel,
}: {
  zone: ArmoryWorldZone;
  active: boolean;
  onTravel: (zoneKey: ArmoryWorldZoneKey) => void;
}) {
  const groupRef = useRef<Group>(null);

  useFrame((state) => {
    if (!groupRef.current) return;
    const lift = active ? Math.sin(state.clock.elapsedTime * 5.4) * 0.025 : 0;
    groupRef.current.position.y = lift;
  });

  const handlePointer = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    onTravel(zone.key);
  };

  return (
    <group>
      <mesh position={[zone.approach.x, 0.18, zone.approach.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[zone.radius - 0.08, zone.radius, 48]} />
        <meshStandardMaterial
          color={zone.accent}
          emissive={zone.color}
          emissiveIntensity={active ? 0.42 : 0.08}
          transparent
          opacity={active ? 0.42 : 0.18}
        />
      </mesh>

      <group ref={groupRef} position={[zone.position.x, 0.2, zone.position.z]} onPointerDown={handlePointer}>
        <mesh receiveShadow position={[0, -0.04, 0]}>
          <boxGeometry args={[2.6, 0.16, 2.15]} />
          <meshStandardMaterial color="#101615" roughness={0.8} metalness={0.16} />
        </mesh>
        <GlbBuilding
          assetKey={zone.assetKey}
          scale={zone.modelScale}
          rotation={[0, zone.modelRotation, 0]}
        />
        <ZoneSpecialty zone={zone} active={active} />
      </group>

      {active ? (
        <Html
          center
          position={[zone.npcPosition.x, 1.28, zone.npcPosition.z]}
          className={styles.sceneBubble}
        >
          <strong>{zone.npc}</strong>
          <span>구역 진입 가능</span>
        </Html>
      ) : null}
    </group>
  );
}

function GlbBuilding({
  assetKey,
  scale,
  rotation,
}: {
  assetKey: ArmoryWorldAssetKey;
  scale: number;
  rotation: [number, number, number];
}) {
  return (
    <GlbModel
      path={ARMORY_WORLD_ASSETS[assetKey].path}
      position={[0, 0, 0]}
      rotation={rotation}
      scale={scale}
    />
  );
}

function GlbModel({
  path,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
}: GlbModelProps) {
  const gltf = useGLTF(path) as { scene: Group };
  const clone = useMemo(() => gltf.scene.clone(true), [gltf.scene]);

  return (
    <primitive
      object={clone}
      position={position}
      rotation={rotation}
      scale={scale}
      castShadow
      receiveShadow
    />
  );
}

function ZoneSpecialty({
  zone,
  active,
}: {
  zone: ArmoryWorldZone;
  active: boolean;
}) {
  switch (zone.key) {
    case "towaski":
      return <GunShopProps active={active} color={zone.color} accent={zone.accent} />;
    case "acheron":
      return <ForgeProps active={active} color={zone.color} accent={zone.accent} />;
    case "lab":
      return <LabProps active={active} color={zone.color} accent={zone.accent} />;
    case "simulator":
      return <RangeProps active={active} color={zone.color} accent={zone.accent} />;
    case "strategic":
      return <StrategicProps active={active} color={zone.color} accent={zone.accent} />;
    case "custom":
      return <CustomWorkshopProps active={active} color={zone.color} accent={zone.accent} />;
  }
}

function GunShopProps({ active, color, accent }: ZonePropProps) {
  return (
    <group position={[0.65, 0.46, 0.2]} rotation={[0, -0.3, 0]}>
      <mesh castShadow position={[0, 0.12, 0]}>
        <boxGeometry args={[0.78, 0.18, 0.34]} />
        <meshStandardMaterial color="#1d2223" roughness={0.7} metalness={0.3} />
      </mesh>
      {[-0.22, 0, 0.22].map((x) => (
        <mesh key={x} castShadow position={[x, 0.33, 0]} rotation={[0.2, 0.08, Math.PI / 2]}>
          <cylinderGeometry args={[0.035, 0.035, 0.76, 8]} />
          <meshStandardMaterial color={active ? accent : color} roughness={0.44} metalness={0.48} />
        </mesh>
      ))}
      <mesh position={[0, 0.58, 0]}>
        <boxGeometry args={[0.92, 0.06, 0.12]} />
        <meshStandardMaterial color={accent} emissive={color} emissiveIntensity={0.25} />
      </mesh>
    </group>
  );
}

function ForgeProps({ active, color, accent }: ZonePropProps) {
  return (
    <group position={[-0.58, 0.36, -0.1]}>
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[0.34, 0.44, 0.48, 16]} />
        <meshStandardMaterial color="#2a211d" roughness={0.74} metalness={0.28} />
      </mesh>
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.22, 0.28, 0.08, 16]} />
        <meshStandardMaterial color={accent} emissive={color} emissiveIntensity={active ? 0.9 : 0.42} />
      </mesh>
      <mesh castShadow position={[0.26, 0.76, -0.22]}>
        <cylinderGeometry args={[0.1, 0.12, 0.9, 12]} />
        <meshStandardMaterial color="#1b1a18" roughness={0.6} metalness={0.36} />
      </mesh>
      <mesh position={[0.26, 1.26, -0.22]}>
        <coneGeometry args={[0.18, 0.36, 12]} />
        <meshStandardMaterial color="#3a2c25" emissive={color} emissiveIntensity={active ? 0.28 : 0.08} />
      </mesh>
    </group>
  );
}

function LabProps({ active, color, accent }: ZonePropProps) {
  return (
    <group position={[0.62, 0.42, -0.18]}>
      {[-0.22, 0.22].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.13, 0.15, 0.68, 16]} />
            <meshPhysicalMaterial
              color={accent}
              emissive={color}
              emissiveIntensity={active ? 0.42 : 0.2}
              transparent
              opacity={0.56}
              roughness={0.2}
              transmission={0.2}
            />
          </mesh>
          <mesh position={[0, 0.39, 0]}>
            <sphereGeometry args={[0.1, 14, 10]} />
            <meshStandardMaterial color={accent} emissive={color} emissiveIntensity={0.6} />
          </mesh>
        </group>
      ))}
      <mesh castShadow position={[0, -0.32, 0]}>
        <boxGeometry args={[0.72, 0.12, 0.36]} />
        <meshStandardMaterial color="#15282c" roughness={0.52} metalness={0.34} />
      </mesh>
    </group>
  );
}

function RangeProps({ active, color, accent }: ZonePropProps) {
  return (
    <group position={[-0.46, 0.6, 0.06]} rotation={[0, 0.32, 0]}>
      {[0, 0.28, 0.56].map((y, index) => (
        <mesh key={y} castShadow position={[0, y, 0]}>
          <torusGeometry args={[0.28 - index * 0.055, 0.018, 8, 24]} />
          <meshStandardMaterial color={index % 2 ? color : accent} emissive={color} emissiveIntensity={active ? 0.42 : 0.12} />
        </mesh>
      ))}
      <mesh castShadow position={[0, -0.36, 0]}>
        <cylinderGeometry args={[0.04, 0.05, 0.75, 8]} />
        <meshStandardMaterial color="#303a34" roughness={0.62} metalness={0.28} />
      </mesh>
    </group>
  );
}

function StrategicProps({ active, color, accent }: ZonePropProps) {
  return (
    <group position={[-0.58, 0.52, 0.05]}>
      <mesh castShadow position={[0, -0.28, 0]}>
        <boxGeometry args={[0.82, 0.22, 0.52]} />
        <meshStandardMaterial color="#202235" roughness={0.7} metalness={0.22} />
      </mesh>
      <mesh castShadow position={[0, 0.18, 0]} rotation={[0.55, 0, 0]}>
        <cylinderGeometry args={[0.36, 0.2, 0.1, 24]} />
        <meshStandardMaterial color={accent} emissive={color} emissiveIntensity={active ? 0.4 : 0.16} />
      </mesh>
      <mesh castShadow position={[0, -0.06, 0]}>
        <cylinderGeometry args={[0.05, 0.06, 0.52, 10]} />
        <meshStandardMaterial color="#292f39" roughness={0.58} metalness={0.4} />
      </mesh>
      <mesh position={[0.48, -0.12, -0.05]}>
        <boxGeometry args={[0.42, 0.18, 0.28]} />
        <meshStandardMaterial color="#48425d" roughness={0.66} metalness={0.18} />
      </mesh>
    </group>
  );
}

function CustomWorkshopProps({ active, color, accent }: ZonePropProps) {
  return (
    <group position={[0.56, 0.48, -0.08]}>
      <mesh castShadow receiveShadow position={[0, -0.24, 0]}>
        <boxGeometry args={[0.82, 0.16, 0.48]} />
        <meshStandardMaterial color="#292821" roughness={0.62} metalness={0.28} />
      </mesh>
      <mesh position={[0, 0.05, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.035, 0.035, 0.68, 8]} />
        <meshStandardMaterial color={accent} emissive={color} emissiveIntensity={active ? 0.7 : 0.28} />
      </mesh>
      <mesh position={[0, 0.25, 0]}>
        <octahedronGeometry args={[0.24]} />
        <meshStandardMaterial
          color={accent}
          emissive={color}
          emissiveIntensity={active ? 0.65 : 0.24}
          transparent
          opacity={0.66}
        />
      </mesh>
      <mesh castShadow position={[-0.36, 0.15, 0.2]} rotation={[0, 0, 0.48]}>
        <boxGeometry args={[0.08, 0.44, 0.08]} />
        <meshStandardMaterial color="#42413b" roughness={0.58} metalness={0.42} />
      </mesh>
    </group>
  );
}

interface ZonePropProps {
  active: boolean;
  color: string;
  accent: string;
}

function LampPost({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh castShadow position={[0, 0.38, 0]}>
        <cylinderGeometry args={[0.06, 0.07, 0.76, 8]} />
        <meshStandardMaterial color="#342f29" roughness={0.72} metalness={0.22} />
      </mesh>
      <mesh position={[0, 0.82, 0]}>
        <sphereGeometry args={[0.13, 12, 8]} />
        <meshStandardMaterial
          color="#f0d486"
          emissive="#c9a85a"
          emissiveIntensity={0.7}
        />
      </mesh>
    </group>
  );
}
