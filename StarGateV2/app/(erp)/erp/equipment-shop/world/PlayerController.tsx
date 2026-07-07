"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import type { Group } from "three";
import { MathUtils, Vector3 } from "three";

import {
  ARMORY_PLAYER_START,
  clampArmoryPoint,
  getArmoryWorldZone,
  getArmoryZoneAtPoint,
  type ArmoryMoveRequest,
  type ArmoryTravelRequest,
  type ArmoryWorldPoint,
  type ArmoryWorldZoneKey,
} from "./world-zones";

interface PlayerControllerProps {
  moveRequest: ArmoryMoveRequest | null;
  travelRequest: ArmoryTravelRequest | null;
  playerPositionRef: MutableRefObject<Vector3>;
  onZoneFocus: (zoneKey: ArmoryWorldZoneKey | null) => void;
}

const DIRECT_MOVE_KEYS = new Set([
  "KeyW",
  "ArrowUp",
  "KeyA",
  "ArrowLeft",
  "KeyS",
  "ArrowDown",
  "KeyD",
  "ArrowRight",
]);

const MOVE_SPEED = 4.2;
const ARRIVE_EPSILON = 0.08;

export default function PlayerController({
  moveRequest,
  travelRequest,
  playerPositionRef,
  onZoneFocus,
}: PlayerControllerProps) {
  const groupRef = useRef<Group>(null);
  const targetRef = useRef(
    new Vector3(ARMORY_PLAYER_START.x, 0, ARMORY_PLAYER_START.z),
  );
  const keysRef = useRef<Record<string, boolean>>({});
  const lastMoveIdRef = useRef<number | null>(null);
  const lastTravelIdRef = useRef<number | null>(null);
  const lastZoneKeyRef = useRef<ArmoryWorldZoneKey | null>(null);
  const facingRef = useRef(0);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!DIRECT_MOVE_KEYS.has(event.code) || isTypingTarget(event.target)) {
        return;
      }

      event.preventDefault();
      keysRef.current[event.code] = true;
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (!DIRECT_MOVE_KEYS.has(event.code)) return;
      event.preventDefault();
      keysRef.current[event.code] = false;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  useEffect(() => {
    if (!moveRequest || moveRequest.id === lastMoveIdRef.current) return;
    lastMoveIdRef.current = moveRequest.id;
    setTarget(targetRef.current, moveRequest.target);
  }, [moveRequest]);

  useEffect(() => {
    if (!travelRequest || travelRequest.id === lastTravelIdRef.current) return;
    lastTravelIdRef.current = travelRequest.id;
    setTarget(targetRef.current, getArmoryWorldZone(travelRequest.zoneKey).approach);
  }, [travelRequest]);

  useFrame((state, delta) => {
    const player = playerPositionRef.current;
    const directMove = getDirectMove(keysRef.current);

    if (directMove.lengthSq() > 0) {
      directMove.normalize().multiplyScalar(MOVE_SPEED * delta);
      player.add(directMove);
      clampVector(player);
      targetRef.current.copy(player);
      facingRef.current = Math.atan2(directMove.x, directMove.z);
    } else {
      const toTarget = targetRef.current.clone().sub(player);

      if (toTarget.length() > ARRIVE_EPSILON) {
        const step = Math.min(MOVE_SPEED * delta, toTarget.length());
        const motion = toTarget.normalize().multiplyScalar(step);
        player.add(motion);
        facingRef.current = Math.atan2(motion.x, motion.z);
      }
    }

    const zone = getArmoryZoneAtPoint({ x: player.x, z: player.z });
    const zoneKey = zone?.key ?? null;
    if (zoneKey !== lastZoneKeyRef.current) {
      lastZoneKeyRef.current = zoneKey;
      onZoneFocus(zoneKey);
    }

    if (!groupRef.current) return;
    groupRef.current.position.set(player.x, 0.1, player.z);
    groupRef.current.rotation.y = MathUtils.lerp(
      groupRef.current.rotation.y,
      facingRef.current,
      0.16,
    );
    groupRef.current.position.y += Math.sin(state.clock.elapsedTime * 8) * 0.025;
  });

  return (
    <group
      ref={groupRef}
      position={[ARMORY_PLAYER_START.x, 0.1, ARMORY_PLAYER_START.z]}
      scale={0.84}
    >
      <mesh castShadow position={[0, 0.58, 0]}>
        <capsuleGeometry args={[0.22, 0.42, 5, 12]} />
        <meshStandardMaterial color="#1f2b31" roughness={0.74} metalness={0.12} />
      </mesh>
      <mesh castShadow position={[0, 1.02, 0.01]}>
        <sphereGeometry args={[0.24, 18, 12]} />
        <meshStandardMaterial color="#d8c39a" roughness={0.58} />
      </mesh>
      <mesh castShadow position={[0, 1.14, -0.04]}>
        <boxGeometry args={[0.5, 0.16, 0.38]} />
        <meshStandardMaterial color="#131516" roughness={0.7} />
      </mesh>
      <mesh castShadow position={[0, 0.62, -0.24]} rotation={[0.3, 0, 0]}>
        <boxGeometry args={[0.42, 0.48, 0.16]} />
        <meshStandardMaterial color="#33404a" roughness={0.68} metalness={0.22} />
      </mesh>
      <mesh castShadow position={[-0.2, 0.18, 0.05]}>
        <boxGeometry args={[0.13, 0.34, 0.13]} />
        <meshStandardMaterial color="#171b1f" roughness={0.7} />
      </mesh>
      <mesh castShadow position={[0.2, 0.18, 0.05]}>
        <boxGeometry args={[0.13, 0.34, 0.13]} />
        <meshStandardMaterial color="#171b1f" roughness={0.7} />
      </mesh>
      <mesh castShadow position={[0, 0.82, 0.28]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 0.72, 8]} />
        <meshStandardMaterial color="#c9a85a" roughness={0.45} metalness={0.5} />
      </mesh>
    </group>
  );
}

function setTarget(target: Vector3, point: ArmoryWorldPoint) {
  const clamped = clampArmoryPoint(point);
  target.set(clamped.x, 0, clamped.z);
}

function clampVector(vector: Vector3) {
  const clamped = clampArmoryPoint({ x: vector.x, z: vector.z });
  vector.x = clamped.x;
  vector.z = clamped.z;
}

function getDirectMove(keys: Record<string, boolean>): Vector3 {
  const x = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  const z = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
  return new Vector3(x, 0, z);
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.isContentEditable
  );
}
