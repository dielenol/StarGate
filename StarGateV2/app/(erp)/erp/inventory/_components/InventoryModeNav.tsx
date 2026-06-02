import Link from "next/link";

import styles from "./InventoryModeNav.module.css";

interface InventoryModeNavProps {
  active: "personal" | "shared";
}

const MODES = [
  {
    value: "personal",
    label: "개인 인벤토리",
    description: "캐릭터별 장비와 소지품",
    href: "/erp/inventory",
  },
  {
    value: "shared",
    label: "공용 인벤토리",
    description: "공동 보상과 작전 물자",
    href: "/erp/inventory/shared",
  },
] as const;

export default function InventoryModeNav({ active }: InventoryModeNavProps) {
  return (
    <nav className={styles.nav} aria-label="인벤토리 분류">
      {MODES.map((mode) => {
        const isActive = active === mode.value;
        return (
          <Link
            key={mode.value}
            href={mode.href}
            aria-current={isActive ? "page" : undefined}
            className={[styles.nav__item, isActive ? styles["nav__item--active"] : ""]
              .filter(Boolean)
              .join(" ")}
          >
            <span className={styles.nav__label}>{mode.label}</span>
            <span className={styles.nav__description}>{mode.description}</span>
          </Link>
        );
      })}
    </nav>
  );
}
