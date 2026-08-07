"use client";

import { useEffect, useRef } from "react";

import {
  DialogueBeepEngine,
  ReactiveDialogueBeepGate,
  type DialogueBeepOptions,
} from "@/lib/audio/dialogue-beep-engine";

export interface ReactiveDialogueBeepInput {
  messageId: string;
  text: string;
  preset: DialogueBeepOptions["preset"];
  enabled?: boolean;
}

export function useReactiveDialogueBeep({
  messageId,
  text,
  preset,
  enabled = true,
}: ReactiveDialogueBeepInput) {
  const engineRef = useRef<DialogueBeepEngine | null>(null);
  const gateRef = useRef<ReactiveDialogueBeepGate | null>(null);

  if (gateRef.current === null) {
    gateRef.current = new ReactiveDialogueBeepGate(messageId);
  }

  useEffect(() => {
    const engine = new DialogueBeepEngine({ preset });
    engineRef.current = engine;

    return () => {
      void engine.destroy();
      if (engineRef.current === engine) engineRef.current = null;
    };
  }, [preset]);

  useEffect(() => {
    const markReady = () => {
      gateRef.current?.markInteractionReady();
      void engineRef.current?.prime();
      window.removeEventListener("pointerdown", markReady);
      window.removeEventListener("keydown", markReady);
    };

    window.addEventListener("pointerdown", markReady, { once: true });
    window.addEventListener("keydown", markReady, { once: true });

    return () => {
      window.removeEventListener("pointerdown", markReady);
      window.removeEventListener("keydown", markReady);
    };
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    const decision = gateRef.current?.consume(messageId, enabled);
    if (!engine || !decision?.changed) return;

    engine.stop();
    if (!decision.shouldPlay) return;
    void engine.typeText(text, {}, { preset }).catch(() => undefined);
  }, [enabled, messageId, preset, text]);
}
