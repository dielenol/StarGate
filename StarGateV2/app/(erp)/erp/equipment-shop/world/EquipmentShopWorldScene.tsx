"use client";

import { ContactShadows, OrthographicCamera } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Group } from "three";
import { MathUtils, PCFShadowMap, Vector3 } from "three";

import {
  ARMORY_WORLD_ZONES,
  getArmoryWorldZone,
  type ArmoryWorldZone,
  type ArmoryWorldZoneKey,
} from "./world-zones";

interface EquipmentShopWorldSceneProps {
  selectedZoneKey: ArmoryWorldZoneKey;
  onSelectZone: (zone: ArmoryWorldZoneKey) => void;
}

const WALK_HEIGHT = 0.38;

export default function EquipmentShopWorldScene({
  selectedZoneKey,
  onSelectZone,
}: EquipmentShopWorldSceneProps) {
  return (
    <Canvas
      className="armory-world-canvas"
      shadows={{ type: PCFShadowMap }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: false }}
    >
      <color attach="background" args={["#070909"]} />
      <fog attach="fog" args={["#070909", 9, 15]} />
      <ambientLight intensity={1.15} />
      <directionalLight
        castShadow
        position={[3.8, 7.2, 4.6]}
        intensity={2.35}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <pointLight position={[-4, 2.4, 3]} intensity={1.2} color="#c9a85a" />
      <pointLight position={[3.2, 2.2, -3.2]} intensity={1.15} color="#62bfd2" />
      <OrthographicCamera makeDefault position={[5.8, 6.4, 6.2]} zoom={76} />
      <CameraRig selectedZoneKey={selectedZoneKey} />
      <ArmoryMiniatureMap
        selectedZoneKey={selectedZoneKey}
        onSelectZone={onSelectZone}
      />
      <OperatorPawn selectedZoneKey={selectedZoneKey} />
      <ContactShadows
        position={[0, 0.02, 0]}
        opacity={0.34}
        scale={9}
        blur={2.8}
        far={4}
      />
    </Canvas>
  );
}

function CameraRig({ selectedZoneKey }: { selectedZoneKey: ArmoryWorldZoneKey }) {
  const { camera } = useThree();
  const target = getArmoryWorldZone(selectedZoneKey).position;
  const lookAt = useMemo(() => new Vector3(), []);
  const desired = useMemo(() => new Vector3(), []);

  useFrame(() => {
    lookAt.set(target[0] * 0.2, 0.18, target[2] * 0.2);
    desired.set(5.8 + target[0] * 0.1, 6.4, 6.2 + target[2] * 0.1);
    camera.position.lerp(desired, 0.045);
    camera.lookAt(lookAt);
    camera.updateProjectionMatrix();
  });

  return null;
}

function ArmoryMiniatureMap({
  selectedZoneKey,
  onSelectZone,
}: EquipmentShopWorldSceneProps) {
  return (
    <group>
      <FloorPlate />
      <PathNetwork />
      {ARMORY_WORLD_ZONES.map((zone) => (
        <ZoneBuilding
          key={zone.key}
          zone={zone}
          active={zone.key === selectedZoneKey}
          onSelectZone={onSelectZone}
        />
      ))}
      <CentralConsole />
      <PerimeterLights />
    </group>
  );
}

function FloorPlate() {
  return (
    <group>
      <mesh receiveShadow position={[0, -0.06, 0]}>
        <boxGeometry args={[8.8, 0.12, 7.2]} />
        <meshStandardMaterial color="#17201d" roughness={0.78} metalness={0.12} />
      </mesh>
      <mesh receiveShadow position={[0, 0.01, 0]}>
        <boxGeometry args={[8.2, 0.04, 6.55]} />
        <meshStandardMaterial color="#20352f" roughness={0.88} />
      </mesh>
      <mesh receiveShadow position={[0, 0.035, 0]}>
        <boxGeometry args={[7.55, 0.035, 5.9]} />
        <meshStandardMaterial color="#26322b" roughness={0.82} />
      </mesh>
    </group>
  );
}

function PathNetwork() {
  const pathMaterial = (
    <meshStandardMaterial color="#8b7451" roughness={0.86} metalness={0.04} />
  );

  return (
    <group position={[0, 0.08, 0]}>
      <mesh receiveShadow>
        <boxGeometry args={[6.6, 0.06, 0.46]} />
        {pathMaterial}
      </mesh>
      <mesh receiveShadow>
        <boxGeometry args={[0.46, 0.06, 5.3]} />
        {pathMaterial}
      </mesh>
      <mesh receiveShadow position={[-2.6, 0, 1.85]} rotation={[0, 0.38, 0]}>
        <boxGeometry args={[2.4, 0.06, 0.34]} />
        {pathMaterial}
      </mesh>
      <mesh receiveShadow position={[2.75, 0, -1.8]} rotation={[0, 0.42, 0]}>
        <boxGeometry args={[2.15, 0.06, 0.34]} />
        {pathMaterial}
      </mesh>
    </group>
  );
}

function ZoneBuilding({
  zone,
  active,
  onSelectZone,
}: {
  zone: ArmoryWorldZone;
  active: boolean;
  onSelectZone: (zone: ArmoryWorldZoneKey) => void;
}) {
  const groupRef = useRef<Group>(null);
  const height = active ? 0.86 : 0.72;

  useFrame((state) => {
    if (!groupRef.current) return;
    const pulse = active ? Math.sin(state.clock.elapsedTime * 4.4) * 0.035 : 0;
    groupRef.current.position.y = pulse;
  });

  const handlePointer = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    onSelectZone(zone.key);
  };

  return (
    <group
      ref={groupRef}
      position={zone.position}
      onClick={handlePointer}
      onPointerEnter={(event) => {
        event.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerLeave={() => {
        document.body.style.cursor = "";
      }}
    >
      <mesh castShadow receiveShadow position={[0, 0.13, 0]}>
        <boxGeometry args={[zone.footprint[0] + 0.22, 0.18, zone.footprint[1] + 0.22]} />
        <meshStandardMaterial color="#101615" roughness={0.8} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.48, 0]}>
        <boxGeometry args={[zone.footprint[0], height, zone.footprint[1]]} />
        <meshStandardMaterial color={zone.color} roughness={0.64} metalness={0.16} />
      </mesh>
      <mesh castShadow position={[0, 1.02, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[Math.max(zone.footprint[0], zone.footprint[1]) * 0.55, 0.62, 4]} />
        <meshStandardMaterial color={zone.accent} roughness={0.58} metalness={0.12} />
      </mesh>
      <mesh position={[0, 0.22, zone.footprint[1] / 2 + 0.035]}>
        <boxGeometry args={[0.42, 0.34, 0.04]} />
        <meshStandardMaterial color="#0b0d0d" roughness={0.5} metalness={0.26} />
      </mesh>
      <mesh position={[0, 1.38, 0]}>
        <cylinderGeometry args={[0.08, 0.08, active ? 0.78 : 0.46, 12]} />
        <meshStandardMaterial
          color={active ? zone.accent : "#5c665f"}
          emissive={active ? zone.color : "#000000"}
          emissiveIntensity={active ? 0.55 : 0}
        />
      </mesh>
    </group>
  );
}

function CentralConsole() {
  return (
    <group position={[0, 0.08, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.58, 0.66, 0.36, 8]} />
        <meshStandardMaterial color="#1c2628" roughness={0.62} metalness={0.34} />
      </mesh>
      <mesh castShadow position={[0, 0.52, 0]}>
        <cylinderGeometry args={[0.34, 0.42, 0.34, 8]} />
        <meshStandardMaterial
          color="#62bfd2"
          emissive="#235a66"
          emissiveIntensity={0.6}
          roughness={0.38}
        />
      </mesh>
    </group>
  );
}

function PerimeterLights() {
  const lamps = [
    [-4.1, 0, -3.05],
    [4.1, 0, -3.05],
    [-4.1, 0, 3.05],
    [4.1, 0, 3.05],
    [0, 0, -3.05],
    [0, 0, 3.05],
  ] as const;

  return (
    <group>
      {lamps.map(([x, y, z]) => (
        <group key={`${x}-${z}`} position={[x, y, z]}>
          <mesh castShadow position={[0, 0.38, 0]}>
            <cylinderGeometry args={[0.06, 0.07, 0.72, 8]} />
            <meshStandardMaterial color="#363129" roughness={0.72} metalness={0.22} />
          </mesh>
          <mesh position={[0, 0.82, 0]}>
            <sphereGeometry args={[0.13, 12, 8]} />
            <meshStandardMaterial
              color="#f0d486"
              emissive="#c9a85a"
              emissiveIntensity={0.65}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function OperatorPawn({ selectedZoneKey }: { selectedZoneKey: ArmoryWorldZoneKey }) {
  const groupRef = useRef<Group>(null);
  const velocityRef = useRef(new Vector3());
  const target = getArmoryWorldZone(selectedZoneKey).position;

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    const destination = velocityRef.current.set(target[0], WALK_HEIGHT, target[2]);
    groupRef.current.position.lerp(destination, 1 - Math.exp(-delta * 2.2));
    groupRef.current.rotation.y = MathUtils.lerp(
      groupRef.current.rotation.y,
      Math.sin(state.clock.elapsedTime * 1.7) * 0.08,
      0.08,
    );
  });

  return (
    <group ref={groupRef} position={[-0.4, WALK_HEIGHT, 0.42]} scale={0.82}>
      <mesh castShadow position={[0, 0.34, 0]}>
        <cylinderGeometry args={[0.22, 0.24, 0.52, 12]} />
        <meshStandardMaterial color="#1f2529" roughness={0.68} />
      </mesh>
      <mesh castShadow position={[0, 0.72, 0]}>
        <sphereGeometry args={[0.24, 16, 12]} />
        <meshStandardMaterial color="#d8c39a" roughness={0.58} />
      </mesh>
      <mesh castShadow position={[0, 0.91, -0.02]}>
        <boxGeometry args={[0.48, 0.18, 0.38]} />
        <meshStandardMaterial color="#161616" roughness={0.7} />
      </mesh>
      <mesh castShadow position={[-0.16, 0.04, 0.06]}>
        <boxGeometry args={[0.12, 0.32, 0.12]} />
        <meshStandardMaterial color="#202830" />
      </mesh>
      <mesh castShadow position={[0.16, 0.04, 0.06]}>
        <boxGeometry args={[0.12, 0.32, 0.12]} />
        <meshStandardMaterial color="#202830" />
      </mesh>
    </group>
  );
}
