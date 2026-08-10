"use client";

import { useEffect, useState } from "react";

import Image from "next/image";

import Button from "@/components/ui/Button/Button";
import Tag from "@/components/ui/Tag/Tag";

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
  onChatChange,
  onChatSubmit,
  onChoiceSelect,
}: XenoStageProps) {
  const [expiredRetryAt, setExpiredRetryAt] = useState<string | null>(null);
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
  const latestXeno = [...messages].reverse().find((message) => message.speaker === "XENO");
  const expression = latestXeno?.expression ?? DEFAULT_EXPRESSION[relationship.state];
  const remainingCharacters = 300 - chatValue.length;
  const canSubmit =
    !disabled && !isChatPending && !isCoolingDown && chatValue.trim().length > 0 && chatRemaining > 0;

  return (
    <section className={styles.xenoStage} aria-labelledby="xeno-stage-title">
      <div className={styles.xenoStage__portrait}>
        <Image
          src={portraitPath(expression)}
          alt={`제노의 ${relationship.label} 표정`}
          width={520}
          height={680}
          sizes="(max-width: 760px) 100vw, 42vw"
          priority
        />
      </div>
      <div className={styles.xenoStage__content}>
        <header className={styles.xenoStage__header}>
          <div>
            <p className={styles.eyebrow}>XENO · RESEARCH LIAISON</p>
            <h2 id="xeno-stage-title">제노</h2>
          </div>
          <div className={styles.relationship}>
            <Image
              src={relationship.icon}
              alt=""
              width={256}
              height={256}
              sizes="128px"
            />
            <div>
              <Tag tone="gold">{relationship.label}</Tag>
              <p>{relationship.description}</p>
            </div>
          </div>
        </header>

        <div className={styles.dialogueLog} aria-live="polite" aria-relevant="additions text">
          {messages.length === 0 ? (
            <p className={styles.emptyCopy}>아직 기록된 대화가 없습니다. 연구 절차를 물어보세요.</p>
          ) : (
            messages.map((message, index) => (
              <p
                key={message.id}
                className={[
                  styles.dialogueLog__message,
                  message.speaker === "XENO" ? styles["dialogueLog__message--xeno"] : styles["dialogueLog__message--user"],
                  index === messages.length - 1 && message.speaker === "XENO" ? styles["dialogueLog__message--typing"] : "",
                ].filter(Boolean).join(" ")}
              >
                <strong>{message.speaker === "XENO" ? "제노" : "나"}</strong>
                {message.text}
              </p>
            ))
          )}
          {isChatPending ? <p className={styles.pendingCopy}>제노가 응답을 정리하고 있습니다…</p> : null}
        </div>

        {choices.length > 0 ? (
          <div className={styles.dialogueChoices} aria-label="제노에게 할 말 선택">
            {choices.map((choice) => (
              <Button
                key={choice.id}
                size="sm"
                disabled={disabled || choice.disabled || isChatPending}
                onClick={() => onChoiceSelect?.(choice.id)}
              >
                {choice.label}
              </Button>
            ))}
          </div>
        ) : null}

        <div className={styles.chatComposer}>
          <label htmlFor="xeno-free-chat">자유 대화</label>
          <textarea
            id="xeno-free-chat"
            value={chatValue}
            maxLength={300}
            disabled={disabled || isChatPending || isCoolingDown || chatRemaining === 0}
            placeholder="연구 절차에 관해 물어보세요."
            onChange={(event) => onChatChange(event.target.value)}
          />
          <div className={styles.chatComposer__meta}>
            <span>{remainingCharacters}자 남음 · 오늘 {chatRemaining}회{isCoolingDown ? " · 응답 간격 대기" : ""}</span>
            <Button variant="primary" disabled={!canSubmit} onClick={onChatSubmit}>
              전송
            </Button>
          </div>
          {chatError ? <p className={styles.feedbackError} role="alert">{chatError}</p> : null}
        </div>
      </div>
    </section>
  );
}
