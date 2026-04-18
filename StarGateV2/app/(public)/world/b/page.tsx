import Link from "next/link";

import { IconDivider, IconReturn } from "@/components/icons";

import frameStyles from "../../page.module.css";

export default function WorldBPage() {
  return (
    <main className={frameStyles["stargate-page"]}>
      <div className={frameStyles.stargate}>
        <div className={frameStyles.stargate__frame}>
          <div className={frameStyles.stargate__classification}>
            CLASSIFICATION: WORLD ARCHIVE // SECTOR B
          </div>
          <div className={frameStyles.stargate__intro}>
            <span className={frameStyles.stargate__est}>LORE NODE B</span>
            <h1 className={frameStyles.stargate__title}>세계관 B</h1>
            <div className={frameStyles.stargate__ornament}>
              <IconDivider aria-hidden />
            </div>
            <p className={frameStyles["stargate__intro-text"]}>
              세계관 B 세부 기록을 확장할 placeholder 페이지입니다.
            </p>
          </div>
          <div className={frameStyles["stargate__cta-row"]}>
            <Link className={frameStyles["stargate__cta-link"]} href="/world">
              <div className={frameStyles["stargate__cta-outer"]}>
                <div className={frameStyles["stargate__cta-inner"]}>
                  <div className={frameStyles["stargate__cta-icon"]}>
                    <IconReturn aria-hidden />
                  </div>
                  <div className={frameStyles["stargate__cta-title"]}>세계관 메인으로</div>
                  <div className={frameStyles["stargate__cta-subtitle"]}>RETURN TO INDEX</div>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
