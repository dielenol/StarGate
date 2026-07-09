"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { DialogueBeepOptions } from "@/lib/audio/dialogue-beep-engine";
import { DialogueBeepEngine } from "@/lib/audio/dialogue-beep-engine";

export interface NpcLineOptions
  extends Pick<
    DialogueBeepOptions,
    "initialDelay" | "pitch" | "preset" | "speed" | "volume" | "wave"
  > {
  sound?: boolean;
  returnToIdle?: boolean;
}

export interface NpcDialogueConfig<TMood extends string> {
  isOpen: boolean;
  hasMainCharacter: boolean;
  idleDelayMs: number;
  idleLines: readonly { mood: TMood; text: string }[];
  closedMood: TMood;
  closedLine: string;
  noAgentMood: TMood;
  noAgentLine: string;
  welcomeMood: TMood;
  welcomeLine: string;
  beepPreset?: DialogueBeepOptions["preset"];
  beepWave?: DialogueBeepOptions["wave"];
  beepDefaults: { pitch: number; speed: number; volume: number };
  engineVolume: number;
  entrySfxSrc?: string | null;
  entrySfxVolume: number;
}

export interface NpcDialogueReturn<TMood extends string> {
  mood: TMood;
  line: string;
  visibleLine: string;
  typing: boolean;
  playLine: (mood: TMood, text: string, options?: NpcLineOptions) => void;
  clearIdleTimer: () => void;
  scheduleIdle: () => void;
  showLineImmediately: (mood: TMood, text: string) => void;
  resetIdleCycle: () => void;
  stopEngine: () => void;
}

export function useNpcDialogue<TMood extends string>(
  config: NpcDialogueConfig<TMood>,
): NpcDialogueReturn<TMood> {
  const {
    isOpen,
    hasMainCharacter,
    idleDelayMs,
    idleLines,
    closedMood,
    closedLine,
    noAgentMood,
    noAgentLine,
    welcomeMood,
    welcomeLine,
    beepPreset = "tia",
    beepWave,
    beepDefaults,
    engineVolume,
    entrySfxSrc,
    entrySfxVolume,
  } = config;
  // 호출처가 beepDefaults 를 인라인 객체로 넘겨도 playLine 콜백이 매 렌더
  // 재생성되지 않도록 primitive 로 분해해 deps 에 사용한다 (open-state effect 가
  // playLine 을 dep 으로 갖고 있어, 불안정하면 매 렌더 welcome 리셋이 발생).
  const {
    pitch: defaultPitch,
    speed: defaultSpeed,
    volume: defaultVolume,
  } = beepDefaults;

  const [mood, setMood] = useState<TMood>(welcomeMood);
  const [line, setLine] = useState<string>(welcomeLine);
  const [visibleLine, setVisibleLine] = useState<string>(welcomeLine);
  const [typing, setTyping] = useState(false);

  const dialogueEngineRef = useRef<DialogueBeepEngine | null>(null);
  const dialogueReadyRef = useRef(false);
  const lineSequenceRef = useRef(0);
  const idleLineIndexRef = useRef(0);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playLineRef = useRef<
    (mood: TMood, text: string, options?: NpcLineOptions) => void
  >(() => undefined);
  const entrySfxPlayedRef = useRef(false);
  const entrySfxPendingRef = useRef(false);
  const entrySfxAutoAttemptedRef = useRef(false);

  // Refs to keep latest config values accessible inside closures without
  // forcing callback recreation on every render.
  const isOpenRef = useRef(isOpen);
  const hasMainCharacterRef = useRef(hasMainCharacter);
  isOpenRef.current = isOpen;
  hasMainCharacterRef.current = hasMainCharacter;
  // 진입 SFX/웰컴 설정도 ref 동기화 — SFX effect 가 isOpen 에만 반응하면서
  // (제네릭 인터페이스상 동적 값이 올 수 있는) 최신 config 를 stale 없이 사용.
  const entrySfxSrcRef = useRef(entrySfxSrc);
  const entrySfxVolumeRef = useRef(entrySfxVolume);
  const welcomeMoodRef = useRef(welcomeMood);
  const welcomeLineRef = useRef(welcomeLine);
  const beepPresetRef = useRef(beepPreset);
  const beepWaveRef = useRef(beepWave);
  entrySfxSrcRef.current = entrySfxSrc;
  entrySfxVolumeRef.current = entrySfxVolume;
  welcomeMoodRef.current = welcomeMood;
  welcomeLineRef.current = welcomeLine;
  beepPresetRef.current = beepPreset;
  beepWaveRef.current = beepWave;

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const scheduleIdle = useCallback(() => {
    clearIdleTimer();
    idleTimerRef.current = setTimeout(() => {
      if (!isOpenRef.current) {
        setMood(closedMood);
        setLine(closedLine);
        setVisibleLine(closedLine);
        setTyping(false);
        return;
      }

      if (!hasMainCharacterRef.current) {
        playLineRef.current(noAgentMood, noAgentLine, {
          returnToIdle: false,
        });
        return;
      }

      const idleLine = idleLines[idleLineIndexRef.current % idleLines.length];
      idleLineIndexRef.current += 1;
      playLineRef.current(idleLine.mood, idleLine.text);
    }, idleDelayMs);
  }, [
    clearIdleTimer,
    closedMood,
    closedLine,
    noAgentMood,
    noAgentLine,
    idleLines,
    idleDelayMs,
  ]);

  const playLine = useCallback(
    (npcMood: TMood, text: string, options: NpcLineOptions = {}) => {
      const engine = dialogueEngineRef.current;
      const shouldSound = options.sound ?? dialogueReadyRef.current;

      clearIdleTimer();
      lineSequenceRef.current += 1;
      setMood(npcMood);
      setLine(text);
      setVisibleLine("");
      setTyping(true);
      engine?.stop();

      if (!engine) {
        setVisibleLine(text);
        setTyping(false);
        if (options.returnToIdle !== false) scheduleIdle();
        return;
      }

      const resolvedWave = options.wave ?? beepWaveRef.current;
      const typewriterOptions: DialogueBeepOptions = {
        preset: options.preset ?? beepPresetRef.current,
        pitch: options.pitch ?? defaultPitch,
        speed: options.speed ?? defaultSpeed,
        volume: shouldSound ? (options.volume ?? defaultVolume) : 0,
        initialDelay: options.initialDelay ?? 55,
      };
      if (resolvedWave) {
        typewriterOptions.wave = resolvedWave;
      }

      void engine
        .typeText(
          text,
          {
            onChar: (event) => {
              setVisibleLine(event.visible);
            },
            onDone: () => {
              setVisibleLine(text);
              setTyping(false);
              if (options.returnToIdle !== false) scheduleIdle();
            },
            onCancel: () => {
              setTyping(false);
            },
          },
          typewriterOptions,
        )
        .catch(() => {
          setVisibleLine(text);
          setTyping(false);
          if (options.returnToIdle !== false) scheduleIdle();
        });
    },
    [clearIdleTimer, scheduleIdle, defaultPitch, defaultSpeed, defaultVolume],
  );

  // Keep playLineRef current so scheduleIdle's timeout closure always
  // calls the latest version without being a dep of scheduleIdle itself.
  useEffect(() => {
    playLineRef.current = playLine;
  }, [playLine]);

  // Engine lifecycle: create on mount, destroy on unmount.
  useEffect(() => {
    dialogueEngineRef.current = new DialogueBeepEngine({
      preset: beepPresetRef.current,
      volume: engineVolume,
    });

    return () => {
      clearIdleTimer();
      void dialogueEngineRef.current?.destroy();
      dialogueEngineRef.current = null;
    };
  }, [clearIdleTimer, engineVolume]);

  // Entry SFX: attempt autoplay on mount (when open); fall back to first
  // user gesture. Once played, marks dialogueReady and primes the engine.
  useEffect(() => {
    if (!isOpen || entrySfxPlayedRef.current) return;

    let canceled = false;
    let audio: HTMLAudioElement | null = null;
    const markDialogueReady = () => {
      entrySfxPlayedRef.current = true;
      dialogueReadyRef.current = true;
      void dialogueEngineRef.current?.prime();
    };

    const activeEntrySfxSrc = entrySfxSrcRef.current;
    if (!activeEntrySfxSrc) {
      const primeOnGesture = () => {
        markDialogueReady();
        window.removeEventListener("pointerdown", primeOnGesture);
        window.removeEventListener("keydown", primeOnGesture);
      };

      window.addEventListener("pointerdown", primeOnGesture, { once: true });
      window.addEventListener("keydown", primeOnGesture, { once: true });

      return () => {
        window.removeEventListener("pointerdown", primeOnGesture);
        window.removeEventListener("keydown", primeOnGesture);
      };
    }

    const play = async () => {
      if (canceled || entrySfxPlayedRef.current || entrySfxPendingRef.current) {
        return;
      }

      entrySfxPendingRef.current = true;
      const sequenceBeforePlay = lineSequenceRef.current;
      audio ??= new Audio(activeEntrySfxSrc);
      audio.volume = entrySfxVolumeRef.current;
      audio.currentTime = 0;

      try {
        await audio.play();
        markDialogueReady();
        if (lineSequenceRef.current === sequenceBeforePlay) {
          playLineRef.current(welcomeMoodRef.current, welcomeLineRef.current, {
            sound: true,
          });
        }
        window.removeEventListener("pointerdown", playOnGesture);
        window.removeEventListener("keydown", playOnGesture);
      } catch {
        // Autoplay blocked — will retry on user gesture.
      } finally {
        entrySfxPendingRef.current = false;
      }
    };

    const playOnGesture = () => {
      dialogueReadyRef.current = true;
      void dialogueEngineRef.current?.prime();
      void play();
    };

    if (!entrySfxAutoAttemptedRef.current) {
      entrySfxAutoAttemptedRef.current = true;
      void play();
    }
    window.addEventListener("pointerdown", playOnGesture, { once: true });
    window.addEventListener("keydown", playOnGesture, { once: true });

    return () => {
      canceled = true;
      entrySfxPendingRef.current = false;
      window.removeEventListener("pointerdown", playOnGesture);
      window.removeEventListener("keydown", playOnGesture);
      if (audio) {
        audio.pause();
        audio = null;
      }
    };
  }, [isOpen]);

  const showLineImmediately = useCallback(
    (npcMood: TMood, text: string) => {
      clearIdleTimer();
      setMood(npcMood);
      setLine(text);
      setVisibleLine(text);
      setTyping(false);
    },
    [clearIdleTimer],
  );

  const resetIdleCycle = useCallback(() => {
    idleLineIndexRef.current = 0;
  }, []);

  const stopEngine = useCallback(() => {
    dialogueEngineRef.current?.stop();
  }, []);

  return {
    mood,
    line,
    visibleLine,
    typing,
    playLine,
    clearIdleTimer,
    scheduleIdle,
    showLineImmediately,
    resetIdleCycle,
    stopEngine,
  };
}
