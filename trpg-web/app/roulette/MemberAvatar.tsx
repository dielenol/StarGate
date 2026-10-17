"use client";

import NextImage from "next/image";

import { getDiscordDefaultAvatarUrl } from "@/lib/discord/avatar";

import styles from "./MemberAvatar.module.css";

interface MemberAvatarProps {
  avatarUrl: string | null;
  discordUserId: string;
  name: string;
  /** CSS 픽셀 크기. 기본 36. */
  size?: number;
  /** true 면 스크린리더에 "이름의 Discord 프로필"로 읽힌다. 장식용이면 false. */
  meaningful?: boolean;
  className?: string;
}

export function getInitial(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? "?";
}

export function MemberAvatar({
  avatarUrl,
  discordUserId,
  name,
  size = 36,
  meaningful = false,
  className,
}: MemberAvatarProps) {
  const classes = className ? `${styles.avatar} ${className}` : styles.avatar;
  const style = { "--avatar-size": `${size}px` } as React.CSSProperties;

  if (!avatarUrl) {
    return (
      <span className={classes} style={style} aria-hidden={!meaningful}>
        {getInitial(name)}
      </span>
    );
  }

  return (
    <span className={classes} style={style}>
      <NextImage
        className={styles.avatar__image}
        src={avatarUrl}
        alt={meaningful ? `${name}의 Discord 프로필` : ""}
        width={size}
        height={size}
        sizes={`${size}px`}
        unoptimized
        onError={(event) => {
          const fallbackAvatarUrl = getDiscordDefaultAvatarUrl(discordUserId);
          if (event.currentTarget.src !== fallbackAvatarUrl) {
            event.currentTarget.src = fallbackAvatarUrl;
          }
        }}
      />
    </span>
  );
}
