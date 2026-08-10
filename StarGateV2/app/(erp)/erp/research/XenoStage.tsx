"use client";

import { useEffect, useState } from "react";

import Image from "next/image";

import styles from "./page.module.css";

export type XenoExpression =
  | "neutral"
  | "smirk"
  | "interested"
  | "displeased"
  | "angry";

export type XenoRelationshipState =
  | "CONTEMPT"
  | "HOSTILE"
  | "DISPLEASED"
  | "COLD"
  | "NEUTRAL"
  | "OBSERVING"
  | "ACKNOWLEDGED"
  | "FAVORABLE"
  | "DELIGHTED";

export interface XenoRelationshipPresentation {
  state: XenoRelationshipState;
  label: string;
  description: string;
  icon: string;
}

export interface XenoDialogueMessage {
  id: string;
  speaker: "XENO" | "USER";
  text: string;
  expression?: XenoExpression;
}

export interface XenoDialogueChoice {
  id: string;
  label: string;
  disabled?: boolean;
}

export interface XenoStageProps {
  relationship: XenoRelationshipPresentation;
  messages: readonly XenoDialogueMessage[];
  choices?: readonly XenoDialogueChoice[];
  chatValue: string;
  chatRemaining: number;
  chatRetryAt?: string | null;
  isChatPending?: boolean;
  chatError?: string | null;
  disabled?: boolean;
  preferRelationshipExpression?: boolean;
  isResearchOpen?: boolean;
  onOpenResearch?: (trigger: HTMLButtonElement) => void;
  onChatChange: (value: string) => void;
  onChatSubmit: () => void;
  onChoiceSelect?: (choiceId: string) => void;
}

const DEFAULT_EXPRESSION: Record<XenoRelationshipState, XenoExpression> = {
  CONTEMPT: "angry",
  HOSTILE: "angry",
  DISPLEASED: "displeased",
  COLD: "displeased",
  NEUTRAL: "neutral",
  OBSERVING: "interested",
  ACKNOWLEDGED: "interested",
  FAVORABLE: "smirk",
  DELIGHTED: "smirk",
};

function portraitPath(expression: XenoExpression): string {
  return `/assets/npcs/xeno/portraits/${expression}.webp`;
}

export default function XenoStage({
  relationship,
  messages,
  choices = [],
  chatValue,
  chatRemaining,
  chatRetryAt,
  isChatPending = false,
  chatError,
  disabled = false,
  preferRelationshipExpression = false,
  isResearchOpen = false,
  onOpenResearch,
  onChatChange,
  onChatSubmit,
  onChoiceSelect,
}: XenoStageProps) {
  const [expiredRetryAt, setExpiredRetryAt] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showComposer, setShowComposer] = useState(false);
  const isCoolingDown = Boolean(
    chatRetryAt && chatRetryAt !== expiredRetryAt,
  );

  useEffect(() => {
    if (!chatRetryAt) return;
    const remaining = Math.max(0, Date.parse(chatRetryAt) - Date.now());
    const timeout = window.setTimeout(
      () => setExpiredRetryAt(chatRetryAt),
      remaining + 25,
    );
    return () => window.clearTimeout(timeout);
  }, [chatRetryAt]);

  const latestXenoIndex = messages.findLastIndex(
    (message) => message.speaker === "XENO",
  );
  const latestXeno =
    latestXenoIndex >= 0 ? messages[latestXenoIndex] : undefined;
  const latestUser = [...messages]
    .slice(0, latestXenoIndex >= 0 ? latestXenoIndex : messages.length)
    .reverse()
    .find((message) => message.speaker === "USER");
  const expression = preferRelationshipExpression
    ? DEFAULT_EXPRESSION[relationship.state]
    : latestXeno?.expression ?? DEFAULT_EXPRESSION[relationship.state];
  const remainingCharacters = 300 - chatValue.length;
  const canSubmit =
    !disabled &&
    !isChatPending &&
    !isCoolingDown &&
    chatValue.trim().length > 0 &&
    chatRemaining > 0;

  return (
    <section className={styles.xenoStage} aria-labelledby="xeno-stage-title">
      <div className={styles.relationshipHud}>
        <Image
          src={relationship.icon}
          alt=""
          width={256}
          height={256}
          sizes="52px"
        />
        <div>
          <span>RELATION</span>
          <strong>{relationship.label}</strong>
          <p>{relationship.description}</p>
        </div>
      </div>

      <button
        className={styles.researchTerminal}
        aria-expanded={isResearchOpen}
        onClick={(event) => onOpenResearch?.(event.currentTarget)}
      >
        <span aria-hidden="true">⌬</span>
        <span>
          <small>LAB TERMINAL</small>
          <strong>연구 장치 열기</strong>
        </span>
      </button>

      <div className={styles.xenoStage__portrait} aria-hidden="true">
        <Image
          src={portraitPath(expression)}
          alt=""
          width={768}
          height={1024}
          sizes="(max-width: 760px) 86vw, 48vw"
          priority
        />
      </div>

      {choices.length > 0 && !showTranscript && !showComposer ? (
        <div className={styles.dialogueChoices} aria-label="제노에게 할 말 선택">
          {choices.map((choice, index) => (
            <button
              key={choice.id}
              disabled={disabled || choice.disabled || isChatPending}
              onClick={() => onChoiceSelect?.(choice.id)}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              {choice.label}
            </button>
          ))}
        </div>
      ) : null}

      <article className={styles.dialoguePanel}>
        <div className={styles.dialoguePanel__speaker}>
          <span>XENO · RESEARCH LIAISON</span>
          <h2 id="xeno-stage-title">제노</h2>
        </div>

        {showTranscript ? (
          <div
            className={styles.dialogueTranscript}
            aria-label="제노 대화 기록"
          >
            {messages.map((message) => (
              <p
                key={message.id}
                data-speaker={message.speaker.toLowerCase()}
              >
                <strong>{message.speaker === "XENO" ? "제노" : "나"}</strong>
                {message.text}
              </p>
            ))}
          </div>
        ) : (
          <div
            className={styles.dialoguePanel__copy}
            aria-live="polite"
            aria-atomic="true"
          >
            {latestUser ? <small>나 · {latestUser.text}</small> : null}
            <p className={styles.dialoguePanel__line}>
              {latestXeno?.text ??
                "샘플도 없이 찾아온 건 아니겠지. 내 시간을 낭비할 생각이면 문은 뒤에 있어."}
            </p>
            {isChatPending ? (
              <span className={styles.dialoguePanel__pending}>
                응답을 정리하는 중…
              </span>
            ) : null}
          </div>
        )}

        {showComposer ? (
          <div className={styles.chatComposer}>
            <label htmlFor="xeno-free-chat">직접 말하기</label>
            <textarea
              id="xeno-free-chat"
              value={chatValue}
              maxLength={300}
              disabled={
                disabled ||
                isChatPending ||
                isCoolingDown ||
                chatRemaining === 0
              }
              placeholder="제노에게 할 말을 입력하세요."
              onChange={(event) => onChatChange(event.target.value)}
            />
            <div className={styles.chatComposer__actions}>
              <span>
                {remainingCharacters}자 · 오늘 {chatRemaining}회
                {isCoolingDown ? " · 응답 대기" : ""}
              </span>
              <button disabled={!canSubmit} onClick={onChatSubmit}>
                말한다
              </button>
            </div>
            {chatError ? (
              <p className={styles.feedbackError} role="alert">
                {chatError}
              </p>
            ) : null}
          </div>
        ) : null}

        <footer className={styles.dialoguePanel__toolbar}>
          <button
            aria-pressed={showTranscript}
            onClick={() => {
              setShowTranscript((visible) => !visible);
              setShowComposer(false);
            }}
          >
            {showTranscript ? "현재 대사" : "대화 기록"}
          </button>
          <button
            aria-pressed={showComposer}
            disabled={chatRemaining === 0}
            onClick={() => {
              setShowComposer((visible) => !visible);
              setShowTranscript(false);
            }}
          >
            {showComposer ? "입력 닫기" : "직접 말하기"}
          </button>
          <span>{choices.length > 0 ? "선택지를 고르세요" : "TAP TO INTERACT"}</span>
        </footer>
      </article>
    </section>
  );
}
