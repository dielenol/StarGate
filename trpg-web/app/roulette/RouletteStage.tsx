"use client";

import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type Ref,
  type RefObject,
} from "react";

import { getDiscordDefaultAvatarUrl } from "@/lib/discord/avatar";
import {
  getRouletteCameraTop,
  getRouletteViewHeight,
  ROULETTE_BOARD_WIDTH,
  stepRouletteCameraTop,
  type RouletteCourse,
  type RouletteParticipant,
  type RouletteRace,
} from "@/lib/roulette/engine";
import { drawRouletteScene } from "@/lib/roulette/renderer";

import styles from "./RouletteStage.module.css";

const MIN_BOARD_WIDTH = 240;
const PREVIEW_FRAME_INTERVAL_MS = 1_000 / 30;
/** 탭 전환 등으로 프레임 간격이 벌어져도 카메라가 한 번에 튀지 않게 묶는다. */
const MAX_CAMERA_DELTA_SECONDS = 0.1;
/** 경주가 끝난 뒤 카메라가 이 거리(논리 px) 안에 들어오면 추가 프레임을 멈춘다. */
const CAMERA_SETTLE_EPSILON = 0.5;

export interface RouletteStageHandle {
  render: () => void;
  getCanvas: () => HTMLCanvasElement | null;
  getAvatarImages: () => ReadonlyMap<string, CanvasImageSource>;
}

interface RouletteStageProps {
  ref?: Ref<RouletteStageHandle>;
  course: RouletteCourse;
  raceRef: RefObject<RouletteRace | null>;
  previewParticipants: readonly RouletteParticipant[];
  /** 값이 바뀌면 보드 크기를 다시 맞춘다 (준비 영역 접힘 등 레이아웃 변화). */
  layoutKey: string;
}

function readPixelVariable(style: CSSStyleDeclaration, name: string): number {
  const parsed = Number.parseFloat(style.getPropertyValue(name));
  return Number.isFinite(parsed) ? parsed : 0;
}

function RouletteStageComponent({
  ref,
  course,
  raceRef,
  previewParticipants,
  layoutKey,
}: RouletteStageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const courseRef = useRef(course);
  const previewParticipantsRef = useRef(previewParticipants);
  const avatarImagesRef = useRef(new Map<string, CanvasImageSource>());
  const loadedAvatarUrlsRef = useRef(new Map<string, string>());
  const previewAnimationFrameRef = useRef<number | null>(null);
  const cameraTopRef = useRef(0);
  const cameraClockRef = useRef<number | null>(null);
  /** 직전 프레임에 추적하던 race. 바뀌면(새 경주·리셋) 카메라를 스냅한다. */
  const cameraRaceRef = useRef<RouletteRace | null>(null);
  const settleFrameRef = useRef<number | null>(null);
  const renderRef = useRef<() => void>(() => {});

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const bounds = canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;

    const activeCourse = courseRef.current;
    const viewHeight = getRouletteViewHeight(activeCourse);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const targetWidth = Math.round(bounds.width * pixelRatio);
    const targetHeight = Math.round(bounds.height * pixelRatio);
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }

    const context = canvas.getContext("2d");
    if (!context) return;

    const race = raceRef.current;
    const now = performance.now();
    const deltaSeconds =
      cameraClockRef.current === null
        ? 0
        : Math.min(
            (now - cameraClockRef.current) / 1_000,
            MAX_CAMERA_DELTA_SECONDS,
          );
    cameraClockRef.current = now;

    // 같은 경주 안에서만 부드럽게 따라간다. 새 경주("같은 설정으로 다시" 포함)나 준비 화면은
    // 바로 출발 구간으로 스냅해야 결승선에서 출발점까지 되감기는 장면이 생기지 않는다.
    const raceChanged = race !== cameraRaceRef.current;
    cameraRaceRef.current = race;
    const cameraTarget = getRouletteCameraTop(race, activeCourse);
    const cameraTop =
      race && !raceChanged
        ? stepRouletteCameraTop(
            cameraTopRef.current,
            cameraTarget,
            deltaSeconds,
            viewHeight,
          )
        : cameraTarget;
    cameraTopRef.current = cameraTop;

    context.setTransform(
      targetWidth / ROULETTE_BOARD_WIDTH,
      0,
      0,
      targetHeight / viewHeight,
      0,
      0,
    );
    drawRouletteScene(context, {
      race,
      previewParticipants: previewParticipantsRef.current,
      previewElapsedSeconds: now / 1_000,
      course: activeCourse,
      avatarImages: avatarImagesRef.current,
      view: { top: cameraTop, height: viewHeight },
    });

    // 경주가 끝나면 물리 루프가 멈추므로, 카메라가 결승선에 닿을 때까지 몇 프레임 더 그린다.
    if (
      race?.done &&
      Math.abs(cameraTarget - cameraTop) > CAMERA_SETTLE_EPSILON &&
      settleFrameRef.current === null
    ) {
      settleFrameRef.current = requestAnimationFrame(() => {
        settleFrameRef.current = null;
        renderRef.current();
      });
    }
  }, [raceRef]);

  /**
   * 가용 높이(뷰포트 − 보드 상단 오프셋 − 하단 예약 영역) 기준으로 보드 크기를 정하고
   * 폭은 카메라 창 종횡비에서 유도한다. 유도 폭이 셀 폭보다 크면 폭 기준으로 돌아간다.
   */
  const fit = useCallback(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;

    const stageBounds = stage.getBoundingClientRect();
    if (stageBounds.width <= 0) return;

    const style = getComputedStyle(stage);
    const bottomReserve = readPixelVariable(style, "--stage-bottom-reserve");
    const frameInset = readPixelVariable(style, "--stage-frame-inset");
    const aspect =
      getRouletteViewHeight(courseRef.current) / ROULETTE_BOARD_WIDTH;

    const availableWidth = stageBounds.width - frameInset;
    const availableHeight =
      window.innerHeight -
      (stageBounds.top + window.scrollY) -
      bottomReserve -
      frameInset;

    const widthFromHeight = availableHeight / aspect;
    const width = Math.min(
      availableWidth,
      Math.max(widthFromHeight, MIN_BOARD_WIDTH),
    );
    const height = width * aspect;

    const nextWidth = `${width.toFixed(2)}px`;
    const nextHeight = `${height.toFixed(2)}px`;
    if (canvas.style.width !== nextWidth || canvas.style.height !== nextHeight) {
      canvas.style.width = nextWidth;
      canvas.style.height = nextHeight;
    }
    render();
  }, [render]);

  useImperativeHandle(
    ref,
    () => ({
      render,
      getCanvas: () => canvasRef.current,
      getAvatarImages: () => avatarImagesRef.current,
    }),
    [render],
  );

  useLayoutEffect(() => {
    renderRef.current = render;
  }, [render]);

  useLayoutEffect(() => {
    // 코스가 바뀌면 카메라를 출발 구간으로 되돌린다 (phase 변화에는 반응하지 않는다).
    courseRef.current = course;
    cameraTopRef.current = 0;
    cameraClockRef.current = null;
  }, [course]);

  useLayoutEffect(() => {
    fit();
  }, [course, fit, layoutKey]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const observer = new ResizeObserver(() => fit());
    observer.observe(stage);
    window.addEventListener("resize", fit);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [fit]);

  useEffect(() => {
    previewParticipantsRef.current = previewParticipants;
    if (!raceRef.current) render();
  }, [previewParticipants, raceRef, render]);

  useEffect(() => {
    let cancelled = false;

    for (const participant of previewParticipants) {
      if (!participant.avatarUrl) continue;
      if (
        loadedAvatarUrlsRef.current.get(participant.id) ===
          participant.avatarUrl &&
        avatarImagesRef.current.has(participant.id)
      ) {
        continue;
      }

      avatarImagesRef.current.delete(participant.id);
      loadedAvatarUrlsRef.current.delete(participant.id);

      const avatarUrl = participant.avatarUrl;
      const avatar = new window.Image();
      avatar.crossOrigin = "anonymous";
      avatar.decoding = "async";
      avatar.onload = () => {
        if (cancelled) return;
        avatarImagesRef.current.set(participant.id, avatar);
        loadedAvatarUrlsRef.current.set(participant.id, avatarUrl);
        render();
      };
      avatar.onerror = () => {
        const fallbackAvatarUrl = getDiscordDefaultAvatarUrl(participant.id);
        if (avatar.src !== fallbackAvatarUrl) {
          avatar.src = fallbackAvatarUrl;
        }
      };
      avatar.src = avatarUrl;
    }

    return () => {
      cancelled = true;
    };
  }, [previewParticipants, render]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    let lastRenderTime = 0;
    const animatePreview = (currentTime: number) => {
      if (
        !raceRef.current &&
        currentTime - lastRenderTime >= PREVIEW_FRAME_INTERVAL_MS
      ) {
        render();
        lastRenderTime = currentTime;
      }
      previewAnimationFrameRef.current = requestAnimationFrame(animatePreview);
    };

    previewAnimationFrameRef.current = requestAnimationFrame(animatePreview);
    return () => {
      if (previewAnimationFrameRef.current !== null) {
        cancelAnimationFrame(previewAnimationFrameRef.current);
        previewAnimationFrameRef.current = null;
      }
    };
  }, [raceRef, render]);

  useEffect(
    () => () => {
      if (settleFrameRef.current !== null) {
        cancelAnimationFrame(settleFrameRef.current);
        settleFrameRef.current = null;
      }
    },
    [],
  );

  return (
    <div ref={stageRef} className={styles.stage}>
      <div className={styles.frame}>
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          aria-label={`${course.name}에서 선택한 길드원의 프로필 마블이 회전 장애물과 충돌하며 결승선으로 내려가는 룰렛`}
          role="img"
        />
      </div>
    </div>
  );
}

export const RouletteStage = memo(RouletteStageComponent);
