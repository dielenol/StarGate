/**
 * 편의점 도트풍 SVG 아이콘.
 *
 * - 16x16 viewBox + shape-rendering="crispEdges" 로 픽셀 경계 보존.
 * - slug 미매칭 시 fallback 박스 + ? — silent fail 회피.
 * - 모든 색은 inline literal (theme token 의존 X — 픽셀 아트 시그니처 컬러 보존).
 */

import type { CSSProperties } from "react";

interface Props {
  slug: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
}

type Pixel = [x: number, y: number, fill: string, w?: number, h?: number];

/** Pixel tuple 배열 → <rect> 모음. */
function renderPixels(pixels: Pixel[]) {
  return pixels.map(([x, y, fill, w = 1, h = 1], i) => (
    <rect key={i} x={x} y={y} width={w} height={h} fill={fill} />
  ));
}

/* ── 픽셀 정의 — 16x16 그리드 ── */

const RAMEN_NOODLE = "#f5d27a";
const RAMEN_NOODLE_DARK = "#c89c4a";
const RAMEN_BOWL = "#c43232";
const RAMEN_BOWL_DARK = "#8c1e1e";

const cup_ramen: Pixel[] = [
  // 면 (윗면)
  [3, 3, RAMEN_NOODLE_DARK, 10, 1],
  [2, 4, RAMEN_NOODLE, 12, 1],
  [3, 5, RAMEN_NOODLE_DARK, 1, 1],
  [5, 5, RAMEN_NOODLE_DARK, 1, 1],
  [7, 5, RAMEN_NOODLE_DARK, 1, 1],
  [9, 5, RAMEN_NOODLE_DARK, 1, 1],
  [11, 5, RAMEN_NOODLE_DARK, 1, 1],
  // 그릇 테두리 상단
  [1, 6, RAMEN_BOWL_DARK, 14, 1],
  // 그릇 본체
  [2, 7, RAMEN_BOWL, 12, 5],
  [3, 12, RAMEN_BOWL_DARK, 10, 1],
  [4, 13, RAMEN_BOWL_DARK, 8, 1],
  // 그릇 라벨 띠
  [2, 9, RAMEN_BOWL_DARK, 12, 1],
];

const soda: Pixel[] = [
  // 뚜껑
  [5, 2, "#666", 6, 1],
  [4, 3, "#aaa", 8, 1],
  // 캔 본체
  [4, 4, "#3068b0", 8, 9],
  // 라벨
  [5, 6, "#fff", 6, 1],
  [5, 8, "#fff", 6, 1],
  // 거품
  [4, 13, "#3068b0", 8, 1],
  [5, 14, "#3068b0", 6, 1],
];

const coffee: Pixel[] = [
  // 김
  [6, 2, "#aaa", 1, 1],
  [9, 1, "#aaa", 1, 1],
  [7, 4, "#aaa", 1, 1],
  // 컵 입구
  [3, 6, "#5a3820", 10, 1],
  // 커피
  [4, 7, "#785032", 8, 2],
  // 컵
  [3, 9, "#fff", 1, 4],
  [4, 9, "#5a3820", 8, 4],
  [12, 9, "#fff", 1, 4],
  // 손잡이
  [12, 9, "#5a3820", 2, 1],
  [13, 10, "#5a3820", 1, 2],
  [12, 12, "#5a3820", 2, 1],
  // 받침
  [3, 13, "#fff", 10, 1],
];

const first_aid_patch: Pixel[] = [
  // bandage body
  [3, 4, "#f4d8c8", 10, 8],
  [4, 5, "#fff0e6", 8, 6],
  [3, 4, "#9f3b3b", 10, 1],
  [3, 11, "#9f3b3b", 10, 1],
  [3, 5, "#9f3b3b", 1, 6],
  [12, 5, "#9f3b3b", 1, 6],
  // medical cross
  [7, 6, "#d95f5f", 2, 4],
  [6, 7, "#d95f5f", 4, 2],
  // perforation dots
  [5, 6, "#d8a08e", 1, 1],
  [10, 6, "#d8a08e", 1, 1],
  [5, 9, "#d8a08e", 1, 1],
  [10, 9, "#d8a08e", 1, 1],
];

const calm_mint: Pixel[] = [
  // stem
  [7, 4, "#2d6354", 1, 8],
  [8, 5, "#2d6354", 1, 6],
  // left leaf
  [4, 5, "#5ea68c", 3, 1],
  [3, 6, "#78c5aa", 4, 2],
  [4, 8, "#5ea68c", 3, 1],
  [5, 7, "#e4fff2", 1, 1],
  // right leaf
  [9, 6, "#5ea68c", 3, 1],
  [9, 7, "#78c5aa", 4, 2],
  [9, 9, "#5ea68c", 3, 1],
  [10, 8, "#e4fff2", 1, 1],
  // cool sparkle
  [11, 3, "#c8f7e5", 1, 1],
  [12, 4, "#c8f7e5", 1, 1],
  [3, 10, "#c8f7e5", 1, 1],
];

const field_nutrition_gel: Pixel[] = [
  // gel pouch
  [4, 3, "#6f5630", 8, 1],
  [3, 4, "#c9a04c", 10, 9],
  [4, 5, "#e2bf66", 8, 7],
  [3, 12, "#6f5630", 10, 1],
  // cap
  [6, 2, "#ddd5bd", 4, 1],
  [7, 1, "#8b8068", 2, 1],
  // label stripe
  [5, 7, "#2a8b4c", 6, 2],
  [6, 7, "#f5f0dc", 1, 1],
  [9, 8, "#f5f0dc", 1, 1],
  // squeeze folds
  [5, 10, "#9b7b3b", 6, 1],
  [4, 4, "#f5e7ac", 1, 1],
];

const energy_bar: Pixel[] = [
  // 포장지
  [2, 5, "#c5a255", 12, 6],
  // 라벨
  [3, 7, "#5a3820", 10, 2],
  [4, 7, "#fff", 1, 1],
  [6, 7, "#fff", 1, 1],
  [9, 7, "#fff", 1, 1],
  // 끝 매듭
  [1, 6, "#c89c4a", 1, 4],
  [14, 6, "#c89c4a", 1, 4],
];

const hotpack: Pixel[] = [
  // 본체
  [3, 3, "#c8503c", 10, 10],
  // 안쪽
  [4, 4, "#e87858", 8, 8],
  // 글로우 점
  [6, 6, "#fff5d0", 1, 1],
  [9, 6, "#fff5d0", 1, 1],
  [7, 8, "#fff5d0", 1, 1],
  [10, 9, "#fff5d0", 1, 1],
  [6, 10, "#fff5d0", 1, 1],
  // 끝부분 어둡게
  [3, 12, "#8a3020", 10, 1],
];

const chocolate: Pixel[] = [
  // 외곽
  [2, 3, "#5a3820", 12, 10],
  // 격자 (3x4)
  [4, 5, "#9b6840", 3, 2],
  [8, 5, "#9b6840", 3, 2],
  [12, 5, "#9b6840", 1, 2],
  [4, 8, "#9b6840", 3, 2],
  [8, 8, "#9b6840", 3, 2],
  [12, 8, "#9b6840", 1, 2],
  [4, 11, "#9b6840", 3, 1],
  [8, 11, "#9b6840", 3, 1],
];

function singleCan(x0: number, y0: number, color: string): Pixel[] {
  return [
    [x0 + 1, y0, "#666", 2, 1],
    [x0, y0 + 1, color, 4, 5],
    [x0 + 1, y0 + 2, "#fff", 2, 1],
  ];
}

const beer_pack: Pixel[] = [
  ...singleCan(2, 3, "#b48c3c"),
  ...singleCan(7, 3, "#b48c3c"),
  ...singleCan(2, 9, "#b48c3c"),
  ...singleCan(7, 9, "#b48c3c"),
  // 6팩 띠
  [1, 8, "#5a3820", 14, 1],
  [12, 4, "#b48c3c", 3, 8],
];

const cig_1: Pixel[] = [
  // 막대
  [3, 7, "#f0e8d8", 9, 2],
  // 필터
  [12, 7, "#a08850", 2, 2],
  // 불씨
  [3, 7, "#ff5020", 1, 2],
  // 연기
  [4, 4, "#aaa", 1, 1],
  [3, 5, "#aaa", 1, 1],
  [5, 3, "#aaa", 1, 1],
];

const cig_5: Pixel[] = [
  // 갑
  [3, 4, "#5a3a30", 10, 9],
  // 라벨
  [4, 5, "#c89c4a", 8, 2],
  // 위로 빠진 담배 4개
  [4, 2, "#f0e8d8", 1, 3],
  [6, 2, "#f0e8d8", 1, 3],
  [8, 2, "#f0e8d8", 1, 3],
  [10, 2, "#f0e8d8", 1, 3],
  [4, 2, "#a08850", 1, 1],
  [6, 2, "#a08850", 1, 1],
  [8, 2, "#a08850", 1, 1],
  [10, 2, "#a08850", 1, 1],
  // 갑 어두운 띠
  [3, 11, "#3a2520", 10, 1],
];

const liquor: Pixel[] = [
  // 잔 입구
  [3, 3, "#aaa", 10, 1],
  // 잔 (타원)
  [4, 4, "#9b2020", 8, 1],
  [4, 5, "#9b2020", 8, 4],
  [5, 9, "#9b2020", 6, 1],
  [6, 10, "#9b2020", 4, 1],
  // 글래스 외곽 빛
  [4, 4, "#fff", 1, 1],
  // 잔 다리
  [7, 11, "#aaa", 2, 2],
  // 받침
  [4, 13, "#aaa", 8, 1],
];

const icecream: Pixel[] = [
  // 머리 (크림 3 scoops)
  [5, 2, "#ffd0e0", 6, 1],
  [4, 3, "#ffd0e0", 8, 2],
  [5, 5, "#dcb43c", 6, 1],
  [6, 6, "#dcb43c", 4, 1],
  // 콘
  [5, 7, "#c89c4a", 6, 1],
  [6, 8, "#c89c4a", 4, 1],
  [7, 9, "#c89c4a", 2, 1],
  [7, 10, "#c89c4a", 2, 1],
  [7, 11, "#c89c4a", 2, 2],
  // 콘 격자
  [5, 7, "#8c6a30", 1, 1],
  [10, 7, "#8c6a30", 1, 1],
  [7, 8, "#8c6a30", 1, 1],
  [9, 8, "#8c6a30", 1, 1],
  // 하이라이트
  [6, 3, "#fff", 1, 1],
];

const force_core: Pixel[] = [
  // 다이아몬드
  [7, 2, "#9b6cdc", 2, 1],
  [6, 3, "#9b6cdc", 4, 1],
  [5, 4, "#9b6cdc", 6, 1],
  [4, 5, "#9b6cdc", 8, 1],
  [3, 6, "#9b6cdc", 10, 1],
  [4, 7, "#643cc8", 8, 1],
  [5, 8, "#643cc8", 6, 1],
  [6, 9, "#643cc8", 4, 1],
  [7, 10, "#643cc8", 2, 1],
  // 하이라이트
  [6, 4, "#fff", 1, 1],
  [5, 5, "#fff", 1, 1],
  // 글로우
  [2, 3, "#fff5d0", 1, 1],
  [13, 8, "#fff5d0", 1, 1],
];

const vf_blood: Pixel[] = [
  // 비닐백 외곽
  [4, 2, "#aaa", 8, 1],
  [3, 3, "#888", 10, 11],
  [4, 13, "#aaa", 8, 1],
  // 혈액 안쪽
  [5, 5, "#b41414", 6, 7],
  // 라벨 ribbon
  [3, 7, "#fff", 10, 1],
  [3, 9, "#fff", 10, 1],
  // 빨간 십자
  [7, 7, "#b41414", 2, 1],
  [7, 9, "#b41414", 2, 1],
  // 캡
  [6, 1, "#666", 4, 1],
];

const ICONS: Record<string, Pixel[]> = {
  cup_ramen,
  soda,
  coffee,
  first_aid_patch,
  calm_mint,
  field_nutrition_gel,
  energy_bar,
  hotpack,
  chocolate,
  beer_pack,
  cig_1,
  cig_5,
  liquor,
  icecream,
  force_core,
  vf_blood,
};

/** slug 미매칭 fallback — 빈 사각형 + ? */
const FALLBACK: Pixel[] = [
  [3, 3, "#5a3820", 10, 10],
  [7, 5, "#fff", 2, 1],
  [9, 6, "#fff", 1, 1],
  [9, 8, "#fff", 1, 1],
  [7, 9, "#fff", 2, 1],
  [7, 11, "#fff", 2, 1],
];

export default function ShopItemIcon({
  slug,
  size = 32,
  className,
  style,
}: Props) {
  const pixels = ICONS[slug] ?? FALLBACK;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      className={className}
      style={style}
      aria-hidden
      role="img"
    >
      {renderPixels(pixels)}
    </svg>
  );
}
