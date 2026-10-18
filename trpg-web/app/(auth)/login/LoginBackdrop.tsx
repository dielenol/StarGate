"use client";

import { useEffect, useRef, useState } from "react";

import { createAuroraRenderer } from "@/lib/login-backdrop/aurora";
import {
  createBackdropScene,
  DARK_PALETTE,
  drawBackdropScene,
  LIGHT_PALETTE,
} from "@/lib/login-backdrop/scene";
import { getRenderedTheme, subscribeRenderedTheme } from "@/lib/theme/rendered";

import { useLoginMotion } from "./LoginMotionProvider";
import styles from "./LoginBackdrop.module.css";

/** 오로라는 부드러운 그라데이션이라 절반 해상도로 그려 올려도 차이가 없다. */
const AURORA_RESOLUTION_SCALE = 0.5;
const MAX_FRAME_STEP_SECONDS = 1 / 20;
const STILL_FRAME_TIME = 11.5;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

interface BackdropController {
  setPaused: (paused: boolean) => void;
}

export function LoginBackdrop() {
  const { paused } = useLoginMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const auroraCanvasRef = useRef<HTMLCanvasElement>(null);
  const sceneCanvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<BackdropController | null>(null);
  const initialPausedRef = useRef(paused);
  /** null 은 아직 WebGL 가용 여부를 모르는 상태. CSS 폴백은 false 가 확정됐을 때만 보인다. */
  const [auroraActive, setAuroraActive] = useState<boolean | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    const auroraCanvas = auroraCanvasRef.current;
    const sceneCanvas = sceneCanvasRef.current;
    if (!root || !auroraCanvas || !sceneCanvas) return;
    const context = sceneCanvas.getContext("2d");
    if (!context) return;

    let aurora = createAuroraRenderer(auroraCanvas, {
      onContextLost: () => {
        aurora = null;
        setAuroraActive(false);
      },
    });
    setAuroraActive(aurora !== null);

    const reducedMotion = window.matchMedia(REDUCED_MOTION_QUERY);
    let palette = getRenderedTheme() === "dark" ? DARK_PALETTE : LIGHT_PALETTE;
    let scene = createBackdropScene(1, 1);
    let pixelRatio = 1;
    let time = reducedMotion.matches ? STILL_FRAME_TIME : 0;
    let lastStamp: number | null = null;
    let frame = 0;
    let running = false;
    let userPaused = initialPausedRef.current;

    const draw = () => {
      aurora?.render(time, palette === DARK_PALETTE);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      drawBackdropScene(context, scene, time, palette);
    };

    const tick = (stamp: number) => {
      frame = 0;
      if (!running) return;
      if (lastStamp !== null) {
        time += Math.min((stamp - lastStamp) / 1000, MAX_FRAME_STEP_SECONDS);
      }
      lastStamp = stamp;
      draw();
      frame = requestAnimationFrame(tick);
    };

    const start = () => {
      if (running || userPaused || reducedMotion.matches) return;
      running = true;
      lastStamp = null;
      frame = requestAnimationFrame(tick);
    };

    const stop = () => {
      running = false;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };

    const resize = () => {
      const { width, height } = root.getBoundingClientRect();
      if (!width || !height) return;
      pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      sceneCanvas.width = Math.round(width * pixelRatio);
      sceneCanvas.height = Math.round(height * pixelRatio);
      aurora?.resize(
        Math.max(1, Math.round(width * AURORA_RESOLUTION_SCALE)),
        Math.max(1, Math.round(height * AURORA_RESOLUTION_SCALE)),
      );
      scene = createBackdropScene(width, height);
      if (!running) draw();
    };

    const handleReducedMotionChange = () => {
      if (reducedMotion.matches) {
        stop();
        time = STILL_FRAME_TIME;
        draw();
        return;
      }
      start();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(root);
    const unsubscribeTheme = subscribeRenderedTheme((theme) => {
      palette = theme === "dark" ? DARK_PALETTE : LIGHT_PALETTE;
      if (!running) draw();
    });
    reducedMotion.addEventListener("change", handleReducedMotionChange);

    resize();
    start();

    controllerRef.current = {
      setPaused: (nextPaused) => {
        userPaused = nextPaused;
        if (nextPaused) stop();
        else start();
      },
    };

    return () => {
      stop();
      observer.disconnect();
      unsubscribeTheme();
      reducedMotion.removeEventListener("change", handleReducedMotionChange);
      aurora?.destroy();
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    controllerRef.current?.setPaused(paused);
  }, [paused]);

  return (
    <div
      ref={rootRef}
      className={styles.backdrop}
      data-aurora={auroraActive ?? undefined}
      aria-hidden="true"
    >
      <div className={styles.backdrop__wash} />
      <div className={styles.backdrop__ribbon} />
      <canvas ref={auroraCanvasRef} className={styles.backdrop__aurora} />
      <canvas ref={sceneCanvasRef} className={styles.backdrop__scene} />
      <div className={styles.backdrop__vignette} />
    </div>
  );
}
