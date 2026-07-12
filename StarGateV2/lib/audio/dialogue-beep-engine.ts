export type DialogueWaveform = "soft" | OscillatorType;

export interface DialogueBeepPreset {
  label: string;
  pitch: number;
  speed: number;
  volume: number;
  wave: DialogueWaveform;
  duration?: number;
  attack?: number;
  frequencyVariance?: number;
  wobble?: number;
  punctuationPauses?: Partial<Record<string, number>>;
  skipChars?: string[];
  soundPunctuation?: boolean;
}

export interface DialogueBeepOptions extends Partial<DialogueBeepPreset> {
  preset?: DialoguePresetName | string;
  initialDelay?: number;
}

export interface DialogueBeepEngineInit extends DialogueBeepOptions {
  audioContext?: AudioContext;
  destination?: AudioNode;
}

export interface DialogueTypewriterEvent {
  char: string;
  index: number;
  visible: string;
  visibleIndex: number;
  soundIndex: number;
  isSoundChar: boolean;
  pause: number;
}

export interface DialogueTypewriterResult {
  canceled: boolean;
  visible: string;
  totalChars: number;
  soundedChars: number;
}

export interface DialogueTypewriterHandlers {
  onStart?: () => void;
  onChar?: (event: DialogueTypewriterEvent) => void;
  onDone?: (result: DialogueTypewriterResult) => void;
  onCancel?: (result: DialogueTypewriterResult) => void;
}

interface DialogueResolvedOptions {
  preset: string;
  label: string;
  pitch: number;
  speed: number;
  volume: number;
  wave: DialogueWaveform;
  duration: number;
  attack: number;
  frequencyVariance: number;
  wobble: number;
  initialDelay: number;
  punctuationPauses: Record<string, number>;
  skipChars: string[];
  soundPunctuation: boolean;
}

type AudioContextConstructor = new () => AudioContext;

type WebAudioGlobal = typeof globalThis & {
  webkitAudioContext?: AudioContextConstructor;
};

const DEFAULT_PUNCTUATION_PAUSES: Record<string, number> = {
  "\n": 260,
  "\r": 0,
  "\t": 80,
  " ": 36,
  ",": 105,
  "，": 105,
  "、": 105,
  ".": 70,
  "。": 70,
  "~": 170,
  "!": 150,
  "！": 150,
  "?": 150,
  "？": 150,
  "…": 220,
  ":": 110,
  "：": 110,
  ";": 120,
  "；": 120,
};

const DEFAULT_SKIP_CHARS = [
  "\n",
  "\r",
  "\t",
  " ",
  ",",
  "，",
  "、",
  ".",
  "。",
  "~",
  "!",
  "！",
  "?",
  "？",
  "…",
  ":",
  "：",
  ";",
  "；",
  "-",
  "·",
  "(",
  ")",
  "[",
  "]",
  "{",
  "}",
  "\"",
  "'",
  "“",
  "”",
  "‘",
  "’",
];

const DEFAULT_OPTIONS = {
  preset: "tia",
  label: "TIA / StarMart",
  pitch: 880,
  speed: 44,
  volume: 0.72,
  wave: "soft" as DialogueWaveform,
  duration: 0.03,
  attack: 0.004,
  frequencyVariance: 18,
  wobble: 4,
  initialDelay: 80,
  soundPunctuation: false,
};

export const DIALOGUE_BEEP_PRESETS = {
  tia: {
    label: "TIA / StarMart",
    pitch: 880,
    speed: 44,
    volume: 0.72,
    wave: "soft",
    duration: 0.03,
    frequencyVariance: 18,
    wobble: 4,
  },
  towaski: {
    label: "Reep Towaski / Gunshop",
    pitch: 510,
    speed: 50,
    volume: 0.58,
    wave: "sawtooth",
    duration: 0.024,
    attack: 0.003,
    frequencyVariance: 9,
    wobble: 2,
    punctuationPauses: {
      " ": 38,
      ".": 115,
      "。": 115,
      ",": 95,
      "，": 95,
      "!": 170,
      "！": 170,
      "?": 170,
      "？": 170,
      "…": 240,
    },
  },
  suture: {
    label: "Irena Vuković / Augmentation Lab",
    pitch: 720,
    speed: 47,
    volume: 0.46,
    wave: "soft",
    duration: 0.028,
    attack: 0.006,
    frequencyVariance: 6,
    wobble: 1,
    punctuationPauses: {
      " ": 35,
      ".": 125,
      "。": 125,
      ",": 105,
      "，": 105,
      "!": 165,
      "！": 165,
      "?": 175,
      "？": 175,
      "…": 250,
    },
  },
  temper: {
    label: "Brigid Kane / Acheron Forge",
    pitch: 440,
    speed: 46,
    volume: 0.54,
    wave: "triangle",
    duration: 0.038,
    attack: 0.002,
    frequencyVariance: 20,
    wobble: 5,
    punctuationPauses: {
      " ": 38,
      ".": 120,
      "。": 120,
      ",": 100,
      "，": 100,
      "!": 165,
      "！": 165,
      "?": 175,
      "？": 175,
      "…": 235,
    },
  },
  ratchet: {
    label: "Mateo Rivas / Strategic Supply",
    pitch: 590,
    speed: 43,
    volume: 0.5,
    wave: "square",
    duration: 0.022,
    attack: 0.003,
    frequencyVariance: 7,
    wobble: 2,
    punctuationPauses: {
      " ": 34,
      ".": 105,
      "。": 105,
      ",": 90,
      "，": 90,
      "!": 155,
      "！": 155,
      "?": 165,
      "？": 165,
      "…": 225,
    },
  },
  amalia: {
    label: "Amalia von Essen",
    pitch: 620,
    speed: 54,
    volume: 0.62,
    wave: "triangle",
    duration: 0.035,
    frequencyVariance: 14,
    wobble: 3,
    punctuationPauses: {
      ".": 120,
      "。": 120,
      "!": 180,
      "！": 180,
      "?": 180,
      "？": 180,
    },
  },
  operator: {
    label: "ORDO Operator",
    pitch: 520,
    speed: 40,
    volume: 0.58,
    wave: "square",
    duration: 0.026,
    frequencyVariance: 12,
    wobble: 2,
  },
  system: {
    label: "System Terminal",
    pitch: 760,
    speed: 28,
    volume: 0.48,
    wave: "sine",
    duration: 0.022,
    frequencyVariance: 8,
    wobble: 2,
    punctuationPauses: {
      "\n": 180,
      " ": 24,
    },
  },
  gm: {
    label: "GM Narrator",
    pitch: 700,
    speed: 50,
    volume: 0.58,
    wave: "sawtooth",
    duration: 0.028,
    frequencyVariance: 10,
    wobble: 3,
  },
} as const satisfies Record<string, DialogueBeepPreset>;

export type DialoguePresetName = keyof typeof DIALOGUE_BEEP_PRESETS;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getAudioContextConstructor(): AudioContextConstructor | null {
  const audioGlobal = globalThis as WebAudioGlobal;
  return audioGlobal.AudioContext ?? audioGlobal.webkitAudioContext ?? null;
}

function isPresetName(value: string): value is DialoguePresetName {
  return Object.prototype.hasOwnProperty.call(DIALOGUE_BEEP_PRESETS, value);
}

function normalizeWaveform(wave: DialogueWaveform): OscillatorType {
  return wave === "soft" ? "sine" : wave;
}

function mergePauseMaps(
  ...maps: Array<Partial<Record<string, number>> | undefined>
) {
  const result: Record<string, number> = {};
  for (const map of maps) {
    if (!map) continue;
    for (const [char, pause] of Object.entries(map)) {
      if (typeof pause === "number") {
        result[char] = pause;
      }
    }
  }
  return result;
}

export class DialogueBeepEngine {
  private options: DialogueBeepOptions;
  private audioContext: AudioContext | null;
  private destination: AudioNode | null;
  private ownsAudioContext: boolean;
  private playToken = 0;
  private sleepers = new Set<() => void>();

  constructor(init: DialogueBeepEngineInit = {}) {
    const { audioContext, destination, ...options } = init;
    this.options = options;
    this.audioContext = audioContext ?? null;
    this.destination = destination ?? null;
    this.ownsAudioContext = !audioContext;
  }

  setOptions(options: DialogueBeepOptions) {
    this.options = { ...this.options, ...options };
  }

  setPreset(preset: DialoguePresetName | string) {
    this.setOptions({ preset });
  }

  getOptions(overrides: DialogueBeepOptions = {}): DialogueResolvedOptions {
    return this.resolveOptions(overrides);
  }

  getPauseFor(char: string, overrides: DialogueBeepOptions = {}) {
    const options = this.resolveOptions(overrides);
    return options.punctuationPauses[char] ?? options.speed;
  }

  getFrequencyFor(char: string, index: number, overrides: DialogueBeepOptions = {}) {
    const options = this.resolveOptions(overrides);
    return this.frequencyFor(char, index, options);
  }

  shouldBeep(char: string, overrides: DialogueBeepOptions = {}) {
    const options = this.resolveOptions(overrides);
    return this.isSoundChar(char, options);
  }

  async prime() {
    const context = this.getAudioContext();
    if (!context) return false;
    if (context.state === "suspended") {
      await context.resume().catch(() => undefined);
    }
    return context.state !== "closed";
  }

  async beep(char: string, index = 0, overrides: DialogueBeepOptions = {}) {
    const options = this.resolveOptions(overrides);
    return this.playBeep(char, index, options);
  }

  async typeText(
    text: string,
    handlers: DialogueTypewriterHandlers = {},
    overrides: DialogueBeepOptions = {},
  ): Promise<DialogueTypewriterResult> {
    const options = this.resolveOptions(overrides);
    const token = ++this.playToken;
    const chars = Array.from(text);
    let visible = "";
    let soundIndex = 0;

    handlers.onStart?.();
    await this.sleep(options.initialDelay);

    for (let index = 0; index < chars.length; index += 1) {
      if (token !== this.playToken) {
        return this.cancelResult(handlers, visible, index, soundIndex);
      }

      const char = chars[index] ?? "";
      visible += char;

      const pause = this.pauseFor(char, options);
      const isSoundChar = this.isSoundChar(char, options);
      const event: DialogueTypewriterEvent = {
        char,
        index,
        visible,
        visibleIndex: Array.from(visible).length,
        soundIndex,
        isSoundChar,
        pause,
      };

      if (isSoundChar) {
        void this.playBeep(char, soundIndex, options).catch(() => undefined);
        soundIndex += 1;
      }

      handlers.onChar?.(event);
      await this.sleep(pause);
    }

    if (token !== this.playToken) {
      return this.cancelResult(handlers, visible, chars.length, soundIndex);
    }

    const result = {
      canceled: false,
      visible,
      totalChars: chars.length,
      soundedChars: soundIndex,
    };
    handlers.onDone?.(result);
    return result;
  }

  stop() {
    this.playToken += 1;
    for (const finish of Array.from(this.sleepers)) {
      finish();
    }
    this.sleepers.clear();
  }

  async destroy() {
    this.stop();
    if (
      this.ownsAudioContext &&
      this.audioContext &&
      this.audioContext.state !== "closed"
    ) {
      await this.audioContext.close().catch(() => undefined);
    }
    this.audioContext = null;
    this.destination = null;
  }

  private cancelResult(
    handlers: DialogueTypewriterHandlers,
    visible: string,
    totalChars: number,
    soundedChars: number,
  ): DialogueTypewriterResult {
    const result = {
      canceled: true,
      visible,
      totalChars,
      soundedChars,
    };
    handlers.onCancel?.(result);
    return result;
  }

  private resolveOptions(overrides: DialogueBeepOptions = {}): DialogueResolvedOptions {
    const presetName = String(overrides.preset ?? this.options.preset ?? DEFAULT_OPTIONS.preset);
    const preset: Partial<DialogueBeepPreset> = isPresetName(presetName)
      ? DIALOGUE_BEEP_PRESETS[presetName]
      : {};
    const merged = {
      ...DEFAULT_OPTIONS,
      ...preset,
      ...this.options,
      ...overrides,
    };

    return {
      preset: presetName,
      label: merged.label ?? DEFAULT_OPTIONS.label,
      pitch: Number(merged.pitch ?? DEFAULT_OPTIONS.pitch),
      speed: Number(merged.speed ?? DEFAULT_OPTIONS.speed),
      volume: clamp(Number(merged.volume ?? DEFAULT_OPTIONS.volume), 0, 1),
      wave: merged.wave ?? DEFAULT_OPTIONS.wave,
      duration: Number(merged.duration ?? DEFAULT_OPTIONS.duration),
      attack: Number(merged.attack ?? DEFAULT_OPTIONS.attack),
      frequencyVariance: Number(
        merged.frequencyVariance ?? DEFAULT_OPTIONS.frequencyVariance,
      ),
      wobble: Number(merged.wobble ?? DEFAULT_OPTIONS.wobble),
      initialDelay: Number(merged.initialDelay ?? DEFAULT_OPTIONS.initialDelay),
      punctuationPauses: mergePauseMaps(
        DEFAULT_PUNCTUATION_PAUSES,
        preset.punctuationPauses,
        this.options.punctuationPauses,
        overrides.punctuationPauses,
      ),
      skipChars: [
        ...DEFAULT_SKIP_CHARS,
        ...(preset.skipChars ?? []),
        ...(this.options.skipChars ?? []),
        ...(overrides.skipChars ?? []),
      ],
      soundPunctuation: Boolean(
        merged.soundPunctuation ?? DEFAULT_OPTIONS.soundPunctuation,
      ),
    };
  }

  private getAudioContext() {
    if (this.audioContext?.state === "closed") {
      this.audioContext = null;
    }
    if (!this.audioContext) {
      const AudioContextConstructor = getAudioContextConstructor();
      if (!AudioContextConstructor) return null;
      this.audioContext = new AudioContextConstructor();
      this.ownsAudioContext = true;
    }
    return this.audioContext;
  }

  private async playBeep(
    char: string,
    index: number,
    options: DialogueResolvedOptions,
  ) {
    if (options.volume <= 0) return true;

    const context = this.getAudioContext();
    if (!context) return false;
    if (context.state === "suspended") {
      await context.resume().catch(() => undefined);
    }
    if (context.state === "closed") return false;

    const now = context.currentTime;
    const freq = this.frequencyFor(char, index, options);
    const duration = Math.max(0.006, options.duration);
    const attack = clamp(options.attack, 0.001, duration * 0.7);
    const softMode = options.wave === "soft";
    const output = this.destination ?? context.destination;

    this.playOscillator({
      context,
      output,
      now,
      frequency: freq,
      endFrequency: freq * 1.015,
      duration,
      attack,
      type: normalizeWaveform(options.wave),
      gain: (softMode ? 0.16 : 0.2) * options.volume,
    });

    this.playOscillator({
      context,
      output,
      now,
      frequency: freq * 1.5,
      endFrequency: freq * 1.515,
      duration,
      attack,
      type: "triangle",
      gain: (softMode ? 0.055 : 0.045) * options.volume,
    });

    if (softMode) {
      this.playOscillator({
        context,
        output,
        now,
        frequency: freq * 2.01,
        duration: duration * 0.85,
        attack,
        type: "sine",
        gain: 0.022 * options.volume,
      });
    }

    return true;
  }

  private playOscillator({
    context,
    output,
    now,
    frequency,
    endFrequency,
    duration,
    attack,
    type,
    gain,
  }: {
    context: AudioContext;
    output: AudioNode;
    now: number;
    frequency: number;
    endFrequency?: number;
    duration: number;
    attack: number;
    type: OscillatorType;
    gain: number;
  }) {
    const stopAt = now + duration + 0.006;
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    if (endFrequency) {
      oscillator.frequency.linearRampToValueAtTime(endFrequency, now + duration);
    }

    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, gain),
      now + attack,
    );
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    oscillator.connect(gainNode);
    gainNode.connect(output);
    oscillator.start(now);
    oscillator.stop(stopAt);
    oscillator.onended = () => {
      oscillator.disconnect();
      gainNode.disconnect();
    };
  }

  private pauseFor(char: string, options: DialogueResolvedOptions) {
    return options.punctuationPauses[char] ?? options.speed;
  }

  private frequencyFor(char: string, index: number, options: DialogueResolvedOptions) {
    const code = char.codePointAt(0) ?? 0;
    const pattern = ((code * 7 + index * 11) % 13) - 6;
    const wobble = ((code + index * 5) % 5) * options.wobble;
    return options.pitch + pattern * options.frequencyVariance + wobble;
  }

  private isSoundChar(char: string, options: DialogueResolvedOptions) {
    if (!options.soundPunctuation && options.punctuationPauses[char] !== undefined) {
      return false;
    }
    if (options.skipChars.includes(char)) return false;
    return char.trim().length > 0;
  }

  private sleep(ms: number) {
    if (ms <= 0) return Promise.resolve();

    return new Promise<void>((resolve) => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      const finish = () => {
        if (timeoutId) clearTimeout(timeoutId);
        this.sleepers.delete(finish);
        resolve();
      };

      timeoutId = setTimeout(finish, ms);
      this.sleepers.add(finish);
    });
  }
}
