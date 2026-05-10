/**
 * recharts <linearGradient> 의 id 안정화 훅.
 *
 * useId() 결과에는 콜론(:)이 포함되는데, SVG/CSS selector 로 쓰일 때
 * 콜론이 escaping 안 되면 깨질 수 있어 sanitize 한다.
 *
 * prefix 로 차트 종류를 구분 ("g" = main chart, "sl" = sparkline 등).
 */

import { useId } from "react";

export function useGradientId(prefix: string): string {
  const raw = useId();
  return `${prefix}-${raw.replace(/:/g, "")}`;
}
