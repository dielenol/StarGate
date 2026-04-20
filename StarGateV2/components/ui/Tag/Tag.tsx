import type { HTMLAttributes, ReactNode } from "react";

import styles from "./Tag.module.css";

type TagTone =
  | "default"
  | "gold"
  | "info"
  | "success"
  | "danger"
  | "p0"
  | "p1"
  | "p2";

interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  tone?: TagTone;
}

const TONE_CLASS: Record<TagTone, string> = {
  default: "",
  gold: "tag--gold",
  info: "tag--info",
  success: "tag--success",
  danger: "tag--danger",
  p0: "tag--p0",
  p1: "tag--p1",
  p2: "tag--p2",
};

export default function Tag({
  children,
  tone = "default",
  className,
  ...rest
}: TagProps) {
  const toneClass = TONE_CLASS[tone] ? styles[TONE_CLASS[tone]] : "";

  return (
    <span
      className={[styles.tag, toneClass, className].filter(Boolean).join(" ")}
      {...rest}
    >
      {children}
    </span>
  );
}
