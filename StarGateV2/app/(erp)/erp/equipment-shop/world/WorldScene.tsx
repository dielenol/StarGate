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

      <OrthographicCamera makeDefault position={[6.4, 7.4, 7.2]} zoom={64} />
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
    lookAt.lerp(new Vector3(player.x, 0.42, player.z), 0.08);
    desired.set(player.x + 6.4, 7.4, player.z + 7.2);
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
    <group position={[0, 0.16, 0.08]}>
      <mesh receiveShadow position={[0, 0.04, 0]}>
        <cylinderGeometry args={[1.78, 1.96, 0.16, 8]} />
        <meshStandardMaterial color="#111918" roughness={0.86} metalness={0.24} />
      </mesh>
      <mesh position={[0, 0.13, 0]} rotation={[0, Math.PI / 4, 0]}>
        <torusGeometry args={[1.52, 0.025, 8, 8]} />
        <meshStandardMaterial
          color="#62bfd2"
          emissive="#235a66"
          emissiveIntensity={0.34}
          roughness={0.5}
          metalness={0.2}
        />
      </mesh>
      <InformationDesk />
    </group>
  );
}

function InformationDesk() {
  const hologramRef = useRef<Group>(null);

  useFrame((state) => {
    if (!hologramRef.current) return;
    hologramRef.current.rotation.y = state.clock.elapsedTime * 0.55;
    hologramRef.current.position.y =
      0.94 + Math.sin(state.clock.elapsedTime * 2.4) * 0.025;
  });

  return (
    <group>
      <DeskCounter />
      <DeskAttendant />
      <group ref={hologramRef} position={[0, 0.94, -0.12]}>
        <HologramCampusMap />
      </group>
      <ArmoryDeskWeaponRack />
      <QueueRails />
      <DirectionPylon position={[-1.52, 0.18, 0.84]} rotation={0.3} />
      <DirectionPylon position={[1.52, 0.18, 0.84]} rotation={-0.3} />
      <mesh position={[0, 1.48, -0.92]}>
        <boxGeometry args={[1.92, 0.2, 0.1]} />
        <meshStandardMaterial
          color="#101314"
          emissive="#0d3b42"
          emissiveIntensity={0.26}
          roughness={0.48}
          metalness={0.36}
        />
      </mesh>
      <Html
        center
        position={[0, 1.5, -0.98]}
        className={`${styles.sceneLabel} ${styles["sceneLabel--desk"]}`}
      >
        <strong>안내 데스크</strong>
        <span>NOVUS ARMORY</span>
      </Html>
    </group>
  );
}

function DeskCounter() {
  return (
    <group position={[0, 0.32, 0.06]}>
      <mesh castShadow receiveShadow position={[0, 0.12, 0.2]}>
        <boxGeometry args={[1.8, 0.42, 0.46]} />
        <meshStandardMaterial color="#242c2d" roughness={0.7} metalness={0.36} />
      </mesh>
      <mesh castShadow receiveShadow position={[-0.82, 0.08, -0.12]} rotation={[0, 0.22, 0]}>
        <boxGeometry args={[0.62, 0.36, 0.74]} />
        <meshStandardMaterial color="#202829" roughness={0.72} metalness={0.38} />
      </mesh>
      <mesh castShadow receiveShadow position={[0.82, 0.08, -0.12]} rotation={[0, -0.22, 0]}>
        <boxGeometry args={[0.62, 0.36, 0.74]} />
        <meshStandardMaterial color="#202829" roughness={0.72} metalness={0.38} />
      </mesh>
      <mesh position={[0, 0.39, 0.43]}>
        <boxGeometry args={[1.92, 0.06, 0.08]} />
        <meshStandardMaterial
          color="#f0d486"
          emissive="#8a6f28"
          emissiveIntensity={0.34}
          roughness={0.42}
          metalness={0.44}
        />
      </mesh>
      <mesh position={[0, 0.03, 0.46]}>
        <boxGeometry args={[1.54, 0.08, 0.08]} />
        <meshStandardMaterial
          color="#62bfd2"
          emissive="#235a66"
          emissiveIntensity={0.5}
          roughness={0.42}
          metalness={0.2}
        />
      </mesh>
      <DeskTerminal position={[-0.54, 0.45, 0.02]} rotation={0.24} />
      <DeskTerminal position={[0.56, 0.45, 0.02]} rotation={-0.24} />
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
    <group position={position} rotation={[0, rotation, -0.12]}>
      <mesh castShadow>
        <boxGeometry args={[0.36, 0.06, 0.28]} />
        <meshStandardMaterial color="#0d1213" roughness={0.58} metalness={0.42} />
      </mesh>
      <mesh position={[0, 0.05, -0.08]} rotation={[-0.52, 0, 0]}>
        <boxGeometry args={[0.34, 0.04, 0.22]} />
        <meshStandardMaterial
          color="#62bfd2"
          emissive="#235a66"
          emissiveIntensity={0.55}
          roughness={0.3}
          metalness={0.18}
        />
      </mesh>
    </group>
  );
}

function DeskAttendant() {
  return (
    <group position={[0, 0.55, -0.42]}>
      <mesh castShadow position={[0, 0.25, 0]}>
        <boxGeometry args={[0.32, 0.48, 0.2]} />
        <meshStandardMaterial color="#1e3439" roughness={0.72} metalness={0.12} />
      </mesh>
      <mesh castShadow position={[0, 0.58, 0]}>
        <sphereGeometry args={[0.16, 12, 10]} />
        <meshStandardMaterial color="#d4b58a" roughness={0.62} metalness={0.02} />
      </mesh>
      <mesh castShadow position={[0, 0.74, -0.02]}>
        <boxGeometry args={[0.34, 0.08, 0.22]} />
        <meshStandardMaterial color="#101314" roughness={0.6} metalness={0.28} />
      </mesh>
      <mesh position={[0, 0.79, -0.05]}>
        <boxGeometry args={[0.22, 0.03, 0.08]} />
        <meshStandardMaterial
          color="#f0d486"
          emissive="#8a6f28"
          emissiveIntensity={0.34}
          roughness={0.4}
        />
      </mesh>
      {[-0.24, 0.24].map((x) => (
        <mesh key={x} castShadow position={[x, 0.27, 0.02]} rotation={[0, 0, x > 0 ? -0.34 : 0.34]}>
          <boxGeometry args={[0.08, 0.36, 0.08]} />
          <meshStandardMaterial color="#263f42" roughness={0.72} metalness={0.16} />
        </mesh>
      ))}
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

function ArmoryDeskWeaponRack() {
  return (
    <group position={[0, 0.58, -1.03]}>
      <mesh castShadow receiveShadow position={[0, 0.34, 0]}>
        <boxGeometry args={[1.64, 0.78, 0.12]} />
        <meshStandardMaterial color="#111516" roughness={0.66} metalness={0.34} />
      </mesh>
      <mesh position={[0, 0.76, -0.07]}>
        <boxGeometry args={[1.48, 0.06, 0.08]} />
        <meshStandardMaterial
          color="#62bfd2"
          emissive="#235a66"
          emissiveIntensity={0.42}
          roughness={0.34}
        />
      </mesh>
      <MiniWeapon position={[-0.42, 0.46, -0.1]} length={0.62} color="#c9a85a" />
      <MiniWeapon position={[0.0, 0.32, -0.1]} length={0.82} color="#62bfd2" />
      <MiniWeapon position={[0.42, 0.5, -0.1]} length={0.68} color="#d46b4a" />
    </group>
  );
}

function MiniWeapon({
  position,
  length,
  color,
}: {
  position: [number, number, number];
  length: number;
  color: string;
}) {
  return (
    <group position={position} rotation={[0, 0, -0.18]}>
      <mesh castShadow>
        <boxGeometry args={[length, 0.07, 0.08]} />
        <meshStandardMaterial color="#2b3131" roughness={0.48} metalness={0.52} />
      </mesh>
      <mesh castShadow position={[length * 0.24, -0.1, 0]}>
        <boxGeometry args={[0.12, 0.2, 0.07]} />
        <meshStandardMaterial color="#15191a" roughness={0.58} metalness={0.46} />
      </mesh>
      <mesh position={[-length * 0.36, 0.0, 0]}>
        <boxGeometry args={[0.16, 0.035, 0.09]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.36}
          roughness={0.36}
        />
      </mesh>
    </group>
  );
}

function QueueRails() {
  const posts = [
    [-1.14, 0.0],
    [-0.52, 0.54],
    [0.52, 0.54],
    [1.14, 0.0],
  ] as const;

  return (
    <group position={[0, 0.18, 1.1]}>
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
      <mesh position={[-0.84, 0.52, 0.28]} rotation={[0, 0.68, Math.PI / 2]}>
        <cylinderGeometry args={[0.018, 0.018, 0.82, 8]} />
        <meshStandardMaterial color="#c9a85a" roughness={0.44} metalness={0.24} />
      </mesh>
      <mesh position={[0, 0.52, 0.54]} rotation={[0, Math.PI / 2, Math.PI / 2]}>
        <cylinderGeometry args={[0.018, 0.018, 1.04, 8]} />
        <meshStandardMaterial color="#c9a85a" roughness={0.44} metalness={0.24} />
      </mesh>
      <mesh position={[0.84, 0.52, 0.28]} rotation={[0, -0.68, Math.PI / 2]}>
        <cylinderGeometry args={[0.018, 0.018, 0.82, 8]} />
        <meshStandardMaterial color="#c9a85a" roughness={0.44} metalness={0.24} />
      </mesh>
    </group>
  );
}

function DirectionPylon({
  position,
  rotation,
}: {
  position: [number, number, number];
  rotation: number;
}) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh castShadow>
        <boxGeometry args={[0.24, 0.84, 0.18]} />
        <meshStandardMaterial color="#171d1e" roughness={0.64} metalness={0.32} />
      </mesh>
      <mesh position={[0, 0.1, -0.095]}>
        <boxGeometry args={[0.18, 0.46, 0.03]} />
        <meshStandardMaterial
          color="#62bfd2"
          emissive="#235a66"
          emissiveIntensity={0.46}
          roughness={0.32}
        />
      </mesh>
      <mesh position={[0, 0.36, -0.12]} rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[0.12, 0.12, 0.03]} />
        <meshStandardMaterial color="#f0d486" emissive="#8a6f28" emissiveIntensity={0.26} />
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
