import Image from "next/image";

import type { CSSProperties } from "react";

import { getShopItemImageSrc } from "@/lib/shop/item-images";
import { IconGoods } from "@/components/icons";

interface Props {
  slug: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
}

export default function ShopItemIcon({
  slug,
  size = 32,
  className,
  style,
}: Props) {
  const src = getShopItemImageSrc(slug);
  const mergedStyle: CSSProperties = {
    display: "block",
    width: size,
    height: size,
    objectFit: "contain",
    imageRendering: "pixelated",
    ...style,
  };

  if (!src) {
    return (
      <IconGoods
        className={className}
        style={{
          width: size,
          height: size,
          ...style,
        }}
        aria-hidden
      />
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
