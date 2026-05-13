import type { ComponentType, SVGProps } from "react";

export type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

// SVG 원본은 public/assets/svg/ic_*.svg 에 단일 소스로 존재하며,
// next.config.ts의 Turbopack SVGR 규칙을 통해 React 컴포넌트로 직접 import된다.
// `.tsx` 래퍼는 필요 없다 — 규칙/속성(viewBox, stroke="currentColor", aria-hidden 등)은 SVG 파일 자체에 명시되어 있음.
export { default as IconApply } from "@/public/assets/svg/ic_apply.svg";
export { default as IconArchive } from "@/public/assets/svg/ic_archive.svg";
export { default as IconArrowLeft } from "@/public/assets/svg/ic_arrow-left.svg";
export { default as IconArrowRight } from "@/public/assets/svg/ic_arrow-right.svg";
export { default as IconBullet } from "@/public/assets/svg/ic_bullet.svg";
export { default as IconCaution } from "@/public/assets/svg/ic_caution.svg";
export { default as IconCharacter } from "@/public/assets/svg/ic_character.svg";
export { default as IconCheckDot } from "@/public/assets/svg/ic_check-dot.svg";
export { default as IconChevronDown } from "@/public/assets/svg/ic_chevron-down.svg";
export { default as IconChevronLeft } from "@/public/assets/svg/ic_chevron-left.svg";
export { default as IconChevronRight } from "@/public/assets/svg/ic_chevron-right.svg";
export { default as IconChevronUp } from "@/public/assets/svg/ic_chevron-up.svg";
export { default as IconClose } from "@/public/assets/svg/ic_close.svg";
export { default as IconConsumable } from "@/public/assets/svg/ic_consumable.svg";
export { default as IconContact } from "@/public/assets/svg/ic_contact.svg";
export { default as IconCredit } from "@/public/assets/svg/ic_credit.svg";
export { default as IconCrown } from "@/public/assets/svg/ic_crown.svg";
export { default as IconDashboard } from "@/public/assets/svg/ic_dashboard.svg";
export { default as IconDivider } from "@/public/assets/svg/ic_divider.svg";
export { default as IconEquipment } from "@/public/assets/svg/ic_equipment.svg";
export { default as IconInfo } from "@/public/assets/svg/ic_info.svg";
export { default as IconInventory } from "@/public/assets/svg/ic_inventory.svg";
export { default as IconMembers } from "@/public/assets/svg/ic_members.svg";
export { default as IconMenu } from "@/public/assets/svg/ic_menu.svg";
export { default as IconNotes } from "@/public/assets/svg/ic_notes.svg";
export { default as IconNotification } from "@/public/assets/svg/ic_notification.svg";
export { default as IconPlayer } from "@/public/assets/svg/ic_player.svg";
export { default as IconProfile } from "@/public/assets/svg/ic_profile.svg";
export { default as IconReturn } from "@/public/assets/svg/ic_return.svg";
export { default as IconRules } from "@/public/assets/svg/ic_rules.svg";
export { default as IconSession } from "@/public/assets/svg/ic_session.svg";
export { default as IconShop } from "@/public/assets/svg/ic_shop.svg";
export { default as IconStock } from "@/public/assets/svg/ic_stock.svg";
export { default as IconStockArt } from "@/public/assets/svg/ic_stock-art.svg";
export { default as IconStockBpe } from "@/public/assets/svg/ic_stock-bpe.svg";
export { default as IconStockGn3 } from "@/public/assets/svg/ic_stock-gn3.svg";
export { default as IconStockMsf } from "@/public/assets/svg/ic_stock-msf.svg";
export { default as IconStockSpz } from "@/public/assets/svg/ic_stock-spz.svg";
export { default as IconStockSsr } from "@/public/assets/svg/ic_stock-ssr.svg";
export { default as IconStockStm } from "@/public/assets/svg/ic_stock-stm.svg";
export { default as IconStockTws } from "@/public/assets/svg/ic_stock-tws.svg";
export { default as IconStockVfp } from "@/public/assets/svg/ic_stock-vfp.svg";
export { default as IconSuccess } from "@/public/assets/svg/ic_success.svg";
export { default as IconSystem } from "@/public/assets/svg/ic_system.svg";
export { default as IconUserAdmin } from "@/public/assets/svg/ic_user-admin.svg";
export { default as IconWiki } from "@/public/assets/svg/ic_wiki.svg";
export { default as IconWorld } from "@/public/assets/svg/ic_world.svg";
export { default as IconZoom } from "@/public/assets/svg/ic_zoom.svg";
