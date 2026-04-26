"use client";

import { signIn } from "next-auth/react";

import styles from "./DiscordLinkButton.module.css";

interface Props {
  /** 'primary' = gold border + → (미연동 상태). 'ghost' = line border + ↻ (재연동). */
  variant?: "primary" | "ghost";
  children?: React.ReactNode;
}

/**
 * Discord 연동/재연동 트리거. /erp/account 의 톤에 맞춘 군사 결재 양식 버튼.
 * 라벨은 호출자가 children 으로 지정 (기본: "Discord 연동" / "다시 연동").
 */
export default function DiscordLinkButton({
  variant = "primary",
  children,
}: Props) {
  function handleClick() {
    signIn("discord", { callbackUrl: "/erp/account" });
  }

  const label =
    children ?? (variant === "ghost" ? "다시 연동" : "Discord 연동");

  return (
    <button
      type="button"
      className={
        variant === "primary" ? styles.primaryBtn : styles.ghostBtn
      }
      onClick={handleClick}
    >
      {label}
    </button>
  );
}
