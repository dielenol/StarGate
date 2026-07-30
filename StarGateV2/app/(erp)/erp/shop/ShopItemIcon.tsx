import type { CSSProperties } from "react";

import Image from "next/image";

import { getShopItemImageSrc } from "@/lib/shop/item-images";

interface Props {
  slug: string;
  imageSrc?: string;
  icon?: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
}

export default function ShopItemIcon({
  slug,
  imageSrc,
  icon,
  size = 32,
  className,
  style,
}: Props) {
  const src =
    imageSrc?.startsWith("/assets/") === true
      ? imageSrc
      : getShopItemImageSrc(slug);
  const mergedStyle: CSSProperties = {
    display: "block",
    width: size,
    height: size,
    objectFit: "contain",
    imageRendering: "pixelated",
    ...style,
  };

  if (!src) {
    if (icon?.trim()) {
      return (
        <span
          className={className}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: size,
            height: size,
            fontSize: Math.max(14, Math.floor(size * 0.68)),
            lineHeight: 1,
            ...style,
          }}
          aria-hidden
        >
          {icon}
        </span>
      );
    }
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        shapeRendering="crispEdges"
        className={className}
        style={style}
        aria-hidden
      >
        <rect x="4" y="4" width="24" height="24" fill="#18171b" />
        <rect x="5" y="5" width="22" height="22" fill="none" stroke="#d1b25c" />
        <path
          d="M13 11h6v3h-3v3h-3zM13 21h4v4h-4z"
          fill="#d1b25c"
        />
      </svg>
    );
  }

  return (
    <Image
      src={src}
      width={size}
      height={size}
      alt=""
      aria-hidden
      draggable={false}
      className={className}
      style={mergedStyle}
      unoptimized
    />
  );
}
