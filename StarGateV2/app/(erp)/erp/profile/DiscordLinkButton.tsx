"use client";

import { signIn } from "next-auth/react";

import styles from "./page.module.css";

export default function DiscordLinkButton() {
  function handleClick() {
    signIn("discord", { callbackUrl: "/erp/profile" });
  }

  return (
    <button
      type="button"
      className={styles.discord__link}
      onClick={handleClick}
    >
      Discord 연동
    </button>
  );
}
