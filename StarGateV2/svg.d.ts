// SVGR 모듈 선언.
// `next.config.ts`의 `turbopack.rules['*.svg']`로 SVGR가 연결된 후,
// 모든 `.svg` import는 React 함수 컴포넌트(default export)로 해석된다.
//
// 예:
//   import IconDashboard from "@/public/assets/svg/ic_dashboard.svg";
//   <IconDashboard width={18} aria-hidden />
declare module "*.svg" {
  import type { FC, SVGProps } from "react";
  const content: FC<SVGProps<SVGSVGElement>>;
  export default content;
}
