import type { TowaskiLicenseTestMode } from "@/lib/equipment-shop/license-test-v2";

const MODE_AUDIO: Record<
  TowaskiLicenseTestMode,
  {
    wave: OscillatorType;
    startHz: number;
    endHz: number;
    duration: number;
    gain: number;
  }
> = {
  firearm: {
    wave: "triangle",
    startHz: 120,
    endHz: 54,
    duration: 0.16,
    gain: 0.22,
  },
  precision: {
    wave: "sine",
    startHz: 680,
    endHz: 340,
    duration: 0.12,
    gain: 0.12,
  },
  heavy: {
    wave: "square",
    startHz: 92,
    endHz: 42,
    duration: 0.24,
    gain: 0.18,
  },
  flame: {
    wave: "sawtooth",
    startHz: 180,
    endHz: 72,
    duration: 0.34,
    gain: 0.1,
  },
  sonic: {
    wave: "sine",
    startHz: 440,
    endHz: 760,
    duration: 0.42,
    gain: 0.13,
  },
  explosive: {
    wave: "triangle",
    startHz: 76,
    endHz: 28,
    duration: 0.38,
    gain: 0.22,
  },
};

export function playTowaskiLicenseModeSound(
  context: AudioContext,
  mode: TowaskiLicenseTestMode,
): void {
  const config = MODE_AUDIO[mode];
  const now = context.currentTime + 0.008;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = config.wave;
  oscillator.frequency.setValueAtTime(config.startHz, now);
  oscillator.frequency.exponentialRampToValueAtTime(
    config.endHz,
    now + config.duration,
  );
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(config.gain, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + config.duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + config.duration + 0.02);
}

export function playTowaskiRhythmCue(
  context: AudioContext,
  kind: "target" | "protected",
): void {
  const now = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = kind === "target" ? "sine" : "square";
  oscillator.frequency.setValueAtTime(kind === "target" ? 720 : 180, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.09, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.1);
}
