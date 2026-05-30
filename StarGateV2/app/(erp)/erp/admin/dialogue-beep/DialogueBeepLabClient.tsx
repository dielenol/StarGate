"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import PageHead from "@/components/ui/PageHead/PageHead";

import {
  DIALOGUE_BEEP_PRESETS,
  DialogueBeepEngine,
  type DialogueBeepOptions,
  type DialoguePresetName,
  type DialogueWaveform,
  type DialogueTypewriterEvent,
} from "@/lib/audio/dialogue-beep-engine";

import styles from "./page.module.css";

const SAMPLE_LINES = [
  {
    id: "greeting",
    label: "입장 인사",
    text: "어서 오세요~! 스타마트입니다!",
  },
  {
    id: "new-items",
    label: "새 상품",
    text: "오늘 새 상품이 잔뜩 들어왔어요! 관심 가는 거 있으면, 편하게 둘러봐 주세요~",
  },
  {
    id: "low-stock",
    label: "재고 부족",
    text: "앗... 그 상품은 오늘 너무 잘 팔려서요. 지금은 재고가 얼마 안 남았어요.",
  },
  {
    id: "ordo",
    label: "ORDO HUD",
    text: "대원님, 신규 작전 보고서가 도착했습니다. 확인 후 응답을 남겨주세요.",
  },
  {
    id: "amalia",
    label: "아말리아",
    text: "질서의 문제는 언제나 사람의 문제입니다. 그러니, 먼저 사람을 보아야 합니다.",
  },
] as const;

const WAVE_OPTIONS: DialogueWaveform[] = [
  "soft",
  "sine",
  "triangle",
  "square",
  "sawtooth",
];

const INITIAL_PRESET: DialoguePresetName = "tia";

function ensureEngine(ref: React.MutableRefObject<DialogueBeepEngine | null>) {
  if (!ref.current) {
    ref.current = new DialogueBeepEngine({ preset: INITIAL_PRESET });
  }
  return ref.current;
}

export default function DialogueBeepLabClient() {
  const engineRef = useRef<DialogueBeepEngine | null>(null);
  const initialPreset = DIALOGUE_BEEP_PRESETS[INITIAL_PRESET];

  const [preset, setPreset] = useState<DialoguePresetName>(INITIAL_PRESET);
  const [wave, setWave] = useState<DialogueWaveform>(initialPreset.wave);
  const [speed, setSpeed] = useState<number>(initialPreset.speed);
  const [pitch, setPitch] = useState<number>(initialPreset.pitch);
  const [volume, setVolume] = useState<number>(initialPreset.volume);
  const [spacePause, setSpacePause] = useState(36);
  const [commaPause, setCommaPause] = useState(105);
  const [periodPause, setPeriodPause] = useState(70);
  const [emphasisPause, setEmphasisPause] = useState(150);
  const [tildePause, setTildePause] = useState(170);
  const [linePause, setLinePause] = useState(260);
  const [text, setText] = useState<string>(SAMPLE_LINES[0].text);
  const [visible, setVisible] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [lastEvent, setLastEvent] = useState<DialogueTypewriterEvent | null>(
    null,
  );
  const [status, setStatus] = useState("대기 중");

  const engineOptions = useMemo<DialogueBeepOptions>(
    () => ({
      preset,
      wave,
      speed,
      pitch,
      volume,
      punctuationPauses: {
        " ": spacePause,
        ",": commaPause,
        "，": commaPause,
        "、": commaPause,
        ".": periodPause,
        "。": periodPause,
        "!": emphasisPause,
        "！": emphasisPause,
        "?": emphasisPause,
        "？": emphasisPause,
        "~": tildePause,
        "\n": linePause,
      },
    }),
    [
      commaPause,
      emphasisPause,
      linePause,
      periodPause,
      pitch,
      preset,
      spacePause,
      speed,
      tildePause,
      volume,
      wave,
    ],
  );

  useEffect(() => {
    engineRef.current = new DialogueBeepEngine({ preset: INITIAL_PRESET });
    return () => {
      void engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, []);

  function applyPreset(nextPreset: DialoguePresetName) {
    const next = DIALOGUE_BEEP_PRESETS[nextPreset];
    setPreset(nextPreset);
    setWave(next.wave);
    setSpeed(next.speed);
    setPitch(next.pitch);
    setVolume(next.volume);
    setStatus(`${next.label} 프리셋 적용`);
  }

  function selectSample(sampleText: string) {
    ensureEngine(engineRef).stop();
    setText(sampleText);
    setVisible("");
    setLastEvent(null);
    setIsPlaying(false);
    setStatus("샘플 선택됨");
  }

  function handleStop() {
    ensureEngine(engineRef).stop();
    setIsPlaying(false);
    setStatus("중지됨");
  }

  function handleTestBeep() {
    const engine = ensureEngine(engineRef);
    engine.setOptions(engineOptions);
    void engine.beep("가", 0, engineOptions);
    setStatus("단일 비프 재생");
  }

  function handlePlay() {
    const source = text.trim();
    if (!source) return;

    const engine = ensureEngine(engineRef);
    engine.stop();
    engine.setOptions(engineOptions);
    setVisible("");
    setLastEvent(null);
    setIsPlaying(true);
    setStatus("재생 중");

    void engine
      .typeText(
        text,
        {
          onStart: () => {
            setVisible("");
            setLastEvent(null);
          },
          onChar: (event) => {
            setVisible(event.visible);
            setLastEvent(event);
          },
          onDone: (result) => {
            setIsPlaying(false);
            setStatus(`완료 · ${result.soundedChars} beeps`);
          },
          onCancel: () => {
            setIsPlaying(false);
          },
        },
        engineOptions,
      )
      .catch((err: unknown) => {
        setIsPlaying(false);
        setStatus(err instanceof Error ? err.message : "재생 실패");
      });
  }

  const presetLabel = DIALOGUE_BEEP_PRESETS[preset].label;
  const progressText = lastEvent
    ? `${lastEvent.visibleIndex} chars · ${lastEvent.soundIndex} beeps · ${lastEvent.pause}ms`
    : "0 chars · 0 beeps";

  return (
    <>
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "관리", href: "/erp/admin/users" },
          { label: "대사 비프 테스트" },
        ]}
        title="대사 비프 테스트"
      />

      <div className={styles.lab}>
        <section className={`${styles.panel} ${styles.stage}`}>
          <div className={styles.hud}>
            <div className={styles.hud__portrait} aria-hidden="true">
              TIA
            </div>
            <div className={styles.hud__copy}>
              <span>NPC HUD PREVIEW</span>
              <strong>{presetLabel}</strong>
            </div>
            <div className={styles.hud__status}>{status}</div>
          </div>

          <div className={styles.dialogue} aria-live="polite">
            {visible ? (
              <>
                {visible}
                {isPlaying ? <span className={styles.cursor}>▸</span> : null}
              </>
            ) : (
              <span className={styles.dialogue__placeholder}>
                재생할 대사를 선택하거나 직접 입력하세요.
              </span>
            )}
          </div>

          <div className={styles.actions}>
            <button
              className={styles.primaryButton}
              disabled={isPlaying || !text.trim()}
              type="button"
              onClick={handlePlay}
            >
              재생
            </button>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={handleStop}
            >
              정지
            </button>
            <button
              className={styles.ghostButton}
              type="button"
              onClick={handleTestBeep}
            >
              비프 테스트
            </button>
            <span className={styles.progress}>{progressText}</span>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panel__head}>
            <span>대사</span>
            <span>{Array.from(text).length} chars</span>
          </div>
          <textarea
            className={styles.textarea}
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={7}
          />
          <div className={styles.sampleGrid}>
            {SAMPLE_LINES.map((line) => (
              <button
                className={styles.sampleButton}
                key={line.id}
                type="button"
                onClick={() => selectSample(line.text)}
              >
                {line.label}
              </button>
            ))}
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panel__head}>
            <span>음색</span>
            <span>{preset}</span>
          </div>

          <div className={styles.controlGrid}>
            <label className={styles.field}>
              <span>캐릭터 preset</span>
              <select
                value={preset}
                onChange={(event) =>
                  applyPreset(event.target.value as DialoguePresetName)
                }
              >
                {Object.entries(DIALOGUE_BEEP_PRESETS).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value.label}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span>wave</span>
              <select
                value={wave}
                onChange={(event) =>
                  setWave(event.target.value as DialogueWaveform)
                }
              >
                {WAVE_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span>speed</span>
              <output>{speed}ms</output>
              <input
                max={90}
                min={24}
                type="range"
                value={speed}
                onChange={(event) => setSpeed(Number(event.target.value))}
              />
            </label>

            <label className={styles.field}>
              <span>pitch</span>
              <output>{pitch}Hz</output>
              <input
                max={1280}
                min={420}
                type="range"
                value={pitch}
                onChange={(event) => setPitch(Number(event.target.value))}
              />
            </label>

            <label className={styles.field}>
              <span>volume</span>
              <output>{Math.round(volume * 100)}%</output>
              <input
                max={1}
                min={0}
                step={0.01}
                type="range"
                value={volume}
                onChange={(event) => setVolume(Number(event.target.value))}
              />
            </label>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panel__head}>
            <span>문장부호 pause</span>
            <span>override</span>
          </div>

          <div className={styles.pauseGrid}>
            <label className={styles.field}>
              <span>space</span>
              <output>{spacePause}ms</output>
              <input
                max={120}
                min={0}
                type="range"
                value={spacePause}
                onChange={(event) => setSpacePause(Number(event.target.value))}
              />
            </label>

            <label className={styles.field}>
              <span>comma</span>
              <output>{commaPause}ms</output>
              <input
                max={240}
                min={20}
                type="range"
                value={commaPause}
                onChange={(event) => setCommaPause(Number(event.target.value))}
              />
            </label>

            <label className={styles.field}>
              <span>period</span>
              <output>{periodPause}ms</output>
              <input
                max={260}
                min={20}
                type="range"
                value={periodPause}
                onChange={(event) => setPeriodPause(Number(event.target.value))}
              />
            </label>

            <label className={styles.field}>
              <span>! ?</span>
              <output>{emphasisPause}ms</output>
              <input
                max={320}
                min={40}
                type="range"
                value={emphasisPause}
                onChange={(event) =>
                  setEmphasisPause(Number(event.target.value))
                }
              />
            </label>

            <label className={styles.field}>
              <span>tilde</span>
              <output>{tildePause}ms</output>
              <input
                max={320}
                min={40}
                type="range"
                value={tildePause}
                onChange={(event) => setTildePause(Number(event.target.value))}
              />
            </label>

            <label className={styles.field}>
              <span>line</span>
              <output>{linePause}ms</output>
              <input
                max={420}
                min={80}
                type="range"
                value={linePause}
                onChange={(event) => setLinePause(Number(event.target.value))}
              />
            </label>
          </div>
        </section>
      </div>
    </>
  );
}
