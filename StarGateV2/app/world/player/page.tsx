"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import frameStyles from "../../page.module.css";
import styles from "./player.module.css";
import CharacterSheet, { type CharacterSheetData } from "./components/CharacterSheet";
import agentsData from "./data/agents.json";

type Agent = {
  id: string;
  codename: string;
  role: string;
  previewImage: string;
  pixelCharacterImage: string;
  sheet: CharacterSheetData;
};

const AGENTS = agentsData as Agent[];

export default function PlayerPage() {
  const [selectedAgentId, setSelectedAgentId] = useState(AGENTS[0]?.id ?? "");
  const selectedAgent = AGENTS.find((agent) => agent.id === selectedAgentId) ?? AGENTS[0];

  return (
    <main className={frameStyles["stargate-page"]}>
      <div className={frameStyles.stargate}>
        <div className={frameStyles.stargate__frame}>
          <div className={frameStyles.stargate__classification}>
            CLASSIFICATION: PERSONNEL ARCHIVE // AGENT DOSSIER
          </div>

          <section className={styles.hero}>
            <span className={frameStyles.stargate__est}>AGENT SELECT</span>
            <h1 className={styles.hero__title}>현장 요원 아카이브</h1>
            <div className={frameStyles.stargate__ornament}>✥</div>
            <p className={styles.hero__description}>
              상단 포트레이트를 선택하면 해당 요원의 상세 기록이 아래 패널에 표시됩니다.
            </p>
          </section>

          <div className={frameStyles.stargate__divider}></div>

          <section className={styles.selectGrid} aria-label="요원 선택">
            {AGENTS.map((agent) => {
              const active = selectedAgent?.id === agent.id;

              return (
                <button
                  aria-pressed={active}
                  className={`${styles.card} ${active ? styles["card--active"] : ""}`}
                  key={agent.id}
                  onClick={() => setSelectedAgentId(agent.id)}
                  type="button"
                >
                  <div className={styles.card__frame}>
                    <Image
                      className={styles.card__portrait}
                      src={agent.previewImage}
                      alt={`${agent.codename} 프로필 프리뷰`}
                      width={440}
                      height={440}
                      loading="lazy"
                    />
                    <div className={styles.card__pixelBadge} aria-hidden="true">
                      <Image
                        className={styles.card__pixelCharacter}
                        src={agent.pixelCharacterImage}
                        alt=""
                        width={96}
                        height={96}
                        loading="lazy"
                      />
                    </div>
                  </div>
                  <div className={styles.card__meta}>
                    <span className={styles.card__name}>{agent.codename}</span>
                    <span className={styles.card__role}>{agent.role}</span>
                  </div>
                </button>
              );
            })}
          </section>

          <section className={styles.sheets}>
            {selectedAgent ? <CharacterSheet key={selectedAgent.id} record={selectedAgent.sheet} /> : null}
          </section>

          <div className={frameStyles["stargate__cta-row"]}>
            <Link className={frameStyles["stargate__cta-link"]} href="/world">
              <div className={frameStyles["stargate__cta-outer"]}>
                <div className={frameStyles["stargate__cta-inner"]}>
                  <div className={frameStyles["stargate__cta-icon"]}>↩</div>
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
