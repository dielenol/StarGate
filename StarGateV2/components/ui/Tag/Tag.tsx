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
  | "p2"
  /* Rank tones — globals.css 의 --rank-*-{marker,text} 팔레트 기반 */
  | "rank-gm"
  | "rank-v"
  | "rank-a"
  | "rank-m"
  | "rank-h"
  | "rank-g"
  | "rank-j"
  | "rank-u";

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
  "rank-gm": "tag--rankGm",
  "rank-v": "tag--rankV",
  "rank-a": "tag--rankA",
  "rank-m": "tag--rankM",
  "rank-h": "tag--rankH",
  "rank-g": "tag--rankG",
  "rank-j": "tag--rankJ",
  "rank-u": "tag--rankU",
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
