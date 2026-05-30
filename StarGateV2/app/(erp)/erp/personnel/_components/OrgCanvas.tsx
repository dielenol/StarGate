"use client";

import type { AgentLevel } from "@/types/character";
import { FACTIONS, INSTITUTIONS, INTERNAL_FACTION_CODE } from "@/types/character";

import {
  FACTION_LOGO,
  INSTITUTION_OVERSIGHT,
  LEVEL_ORDER,
} from "../_constants";
import { preferOptimizedPublicImagePath } from "@/lib/asset-path";

import OrgIcon, {
  FACTION_ICON_MAP,
  INSTITUTION_ICON_MAP,
  SUBUNIT_ICON_MAP,
} from "./OrgIcon";

import styles from "./OrgCanvas.module.css";

const UNASSIGNED_CODE = "UNASSIGNED";

interface UnassignedSample {
  codename: string;
}

interface Props {
  groupCounts: Record<string, number>;
  groupLevelCounts?: Record<string, Partial<Record<AgentLevel, number>>>;
  unassignedSamples?: UnassignedSample[];
  onSelect: (groupCode: string) => void;
}

export default function OrgCanvas({
  groupCounts,
  groupLevelCounts = {},
  unassignedSamples = [],
  onSelect,
}: Props) {
  const unassignedCount = groupCounts[UNASSIGNED_CODE] ?? 0;
  const hasUnassigned = unassignedCount > 0;

  // 외부 권력 블록만 좌측 삼각형 배치 (scope=external). NOVUS_ORDO 는 우측 본부 영역에서 별도 렌더.
  const externalFactions = FACTIONS.filter((f) => f.scope === "external");
  const factionsOrdered = [...externalFactions].sort((a, b) => {
    const order = (code: string) =>
      code === "COUNCIL" ? 0 : code === "MILITARY" ? 1 : 2;
    return order(a.code) - order(b.code);
  });

  const novusOrdo = FACTIONS.find((f) => f.code === INTERNAL_FACTION_CODE);
  const novusOrdoCount = groupCounts[INTERNAL_FACTION_CODE] ?? 0;
  const novusOrdoLevels = groupLevelCounts[INTERNAL_FACTION_CODE] ?? {};
  const novusOrdoLogo = preferOptimizedPublicImagePath(
    FACTION_LOGO[INTERNAL_FACTION_CODE],
  );

  return (
    <section className={styles.canvas}>
      <div className={styles.inner}>
        {/* 본부 (NOVUS_ORDO · scope=internal) + 산하 내부 기관 — 좌측 */}
        <div className={styles.headquartersArea}>
          <div className={styles.sectionTitle}>
            노부스 오르도 본부 · NOVUS ORDO
          </div>

          {/* 본부 박스 — 외부 3대 위에 별개 권위로 서는 본부 자체. 클릭 시 본부 그룹 뷰 진입.
              `data-scope="internal"` 은 OrgCanvas.module.css 의 attribute selector 가 받아 hq 강조를 적용. */}
          {novusOrdo ? (
            <button
              type="button"
              data-scope="internal"
              className={[styles.node, styles["node--lg"]].join(" ")}
              onClick={() => onSelect(INTERNAL_FACTION_CODE)}
              aria-label={`${novusOrdo.label} (${novusOrdoCount}명)`}
            >
              <span className={styles.tl} />
              <span className={styles.br} />

              {novusOrdoLogo ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={novusOrdoLogo}
                  alt=""
                  className={styles.node__watermark}
                  aria-hidden
                />
              ) : null}

              <div className={styles.node__header}>
                <div className={styles.node__headerTop}>
                  {novusOrdoLogo ? (
                    // 본부는 메인 로고(raster)를 직접 노출 — 다른 faction 의 inline SVG 아이콘과 분기.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={novusOrdoLogo}
                      alt=""
                      className={styles.node__headerLogo}
                      aria-hidden
                    />
                  ) : null}
                  <div className={styles.code}>{novusOrdo.code}</div>
                </div>
                <div className={styles.label}>{novusOrdo.label}</div>
              </div>

              <div className={styles.node__section}>
                <div className={styles.node__sectionLabel}>DISTRIBUTION</div>
                <div className={styles.node__distribution}>
                  {LEVEL_ORDER.map((lv) => {
                    const c = novusOrdoLevels[lv] ?? 0;
                    return (
                      <span
                        key={lv}
                        className={[
                          styles.node__pip,
                          styles[`node__pip--${lv}`],
                          c > 0 ? styles["node__pip--on"] : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        <span className={styles.node__pipLevel}>{lv}</span>
                        <span className={styles.node__pipCount}>·{c}</span>
                      </span>
                    );
                  })}
                </div>
              </div>

              <div className={styles.node__section}>
                <div className={styles.node__sectionLabel}>HEADCOUNT</div>
                <div className={styles.headcount}>
                  <span className={styles.headcount__n}>{novusOrdoCount}</span>
                  <span className={styles.headcount__u}>MEMBERS</span>
                </div>
              </div>
            </button>
          ) : null}

          {/* 본부 → 사무국/현장 H-tree connector — SVG 로 명확한 ┬ 분기 + 각 박스 위 수직선.
              preserveAspectRatio="none" + vector-effect="non-scaling-stroke" 로 컨테이너 폭 무관 1px 유지. */}
          <svg
            className={styles.subordinateConnector}
            viewBox="0 0 100 24"
            preserveAspectRatio="none"
            aria-hidden
          >
            <path
              d="M50 0 V10 M25 10 H75 M25 10 V24 M75 10 V24"
              stroke="currentColor"
              strokeWidth="1"
              fill="none"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <h3 className={styles.sectionTitleSub}>
            본부 직속 내부 기관 · INSTITUTIONS
          </h3>
          <div className={styles.institutions}>
            {INSTITUTIONS.map((inst) => {
              const count = groupCounts[inst.code] ?? 0;
              const hasSub = inst.subUnits.length > 0;
              const iconCode = INSTITUTION_ICON_MAP[inst.code];
              const oversight = INSTITUTION_OVERSIGHT[inst.code];
              return (
                <button
                  key={inst.code}
                  type="button"
                  className={[
                    styles.node,
                    styles["node--lg"],
                    hasSub ? styles["node--hasSub"] : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => onSelect(inst.code)}
                  aria-label={`${inst.label} (${count}명)`}
                >
                  <span className={styles.tl} />
                  <span className={styles.br} />

                  <div className={styles.node__header}>
                    <div className={styles.node__headerTop}>
                      {iconCode ? (
                        <OrgIcon
                          code={iconCode}
                          size={20}
                          className={styles.node__headerIcon}
                        />
                      ) : null}
                      <div className={styles.code}>{inst.code}</div>
                    </div>
                    <div className={styles.label}>{inst.label}</div>
                  </div>

                  {hasSub ? (
                    <div className={styles.node__section}>
                      <div className={styles.node__sectionLabel}>
                        SUB UNITS · {inst.subUnits.length}
                      </div>
                      <div className={styles.node__subUnits}>
                        {inst.subUnits.map((s) => {
                          const subIcon = SUBUNIT_ICON_MAP[s.code];
                          return (
                            <span
                              key={s.code}
                              className={styles.node__subUnitChip}
                            >
                              {subIcon ? (
                                <OrgIcon code={subIcon} size={20} />
                              ) : null}
                              <span>{s.label}</span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ) : oversight ? (
                    <div className={styles.node__section}>
                      <div className={styles.node__sectionLabel}>
                        OVERSIGHT
                      </div>
                      <div className={styles.node__doctrine}>{oversight}</div>
                    </div>
                  ) : null}

                  <div className={styles.node__section}>
                    <div className={styles.node__sectionLabel}>HEADCOUNT</div>
                    <div className={styles.headcount}>
                      <span className={styles.headcount__n}>{count}</span>
                      <span className={styles.headcount__u}>MEMBERS</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 외부 권력 블록 (scope=external) — 우측 */}
        <div className={styles.externalArea}>
          <div className={styles.sectionTitle}>노부스 오르도 외부 기관 · EXTERNAL FACTIONS</div>
          <div className={styles.factions}>
            {/* 상호 견제 — 3 꼭짓점을 잇는 양방향 화살표 + 중앙 '견제' 라벨.
                viewBox 100×100 기준: COUNCIL(50,18), MILITARY(20,82), CIVIL(80,82) */}
            <svg
              className={styles.crossfire}
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden
            >
              <defs>
                <marker
                  id="crossfireArrow"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="3"
                  markerHeight="3"
                  orient="auto-start-reverse"
                >
                  <path d="M0,0 L10,5 L0,10 z" fill="var(--danger)" />
                </marker>
              </defs>
              {/* COUNCIL ↔ MILITARY */}
              <line
                x1="50"
                y1="18"
                x2="20"
                y2="82"
                markerStart="url(#crossfireArrow)"
                markerEnd="url(#crossfireArrow)"
              />
              {/* COUNCIL ↔ CIVIL */}
              <line
                x1="50"
                y1="18"
                x2="80"
                y2="82"
                markerStart="url(#crossfireArrow)"
                markerEnd="url(#crossfireArrow)"
              />
              {/* MILITARY ↔ CIVIL */}
              <line
                x1="20"
                y1="82"
                x2="80"
                y2="82"
                markerStart="url(#crossfireArrow)"
                markerEnd="url(#crossfireArrow)"
              />
            </svg>
            <span className={styles.crossfireLabel} aria-hidden>
              상호 감시 · MUTUAL OVERSIGHT
            </span>

            {factionsOrdered.map((faction) => {
              const count = groupCounts[faction.code] ?? 0;
              const iconCode = FACTION_ICON_MAP[faction.code];
              const logo = preferOptimizedPublicImagePath(
                FACTION_LOGO[faction.code],
              );
              return (
                <button
                  key={faction.code}
                  type="button"
                  className={[styles.node, styles["node--lg"]].join(" ")}
                  onClick={() => onSelect(faction.code)}
                  aria-label={`${faction.label} (${count}명)`}
                >
                  <span className={styles.tl} />
                  <span className={styles.br} />

                  {logo ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={logo}
                      alt=""
                      className={styles.node__watermark}
                      aria-hidden
                    />
                  ) : null}

                  <div className={styles.node__header}>
                    <div className={styles.node__headerTop}>
                      {iconCode ? (
                        <OrgIcon
                          code={iconCode}
                          size={20}
                          className={styles.node__headerIcon}
                        />
                      ) : null}
                      <div className={styles.code}>{faction.code}</div>
                    </div>
                    <div className={styles.label}>{faction.label}</div>
                  </div>

                  <div className={styles.node__section}>
                    <div className={styles.node__sectionLabel}>HEADCOUNT</div>
                    <div className={styles.headcount}>
                      <span className={styles.headcount__n}>{count}</span>
                      <span className={styles.headcount__u}>MEMBERS</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 미배정 — 본부/외부 어느 영역에도 속하지 않는 별도 박스. 두 컬럼 span. */}
        {hasUnassigned && (
          <div className={styles.unassignedArea}>
            <div className={styles.unassigned__title}>
              UNASSIGNED · 미배정 · {unassignedCount}명
            </div>
            <button
              type="button"
              className={styles.unassigned__button}
              onClick={() => onSelect(UNASSIGNED_CODE)}
              aria-label={`미배정 (${unassignedCount}명)`}
            >
              <div className={styles.unassigned__samples}>
                {unassignedSamples.slice(0, 3).map((sample) => (
                  <span
                    key={sample.codename}
                    className={styles.code}
                    style={{ fontSize: 10 }}
                  >
                    {sample.codename}
                  </span>
                ))}
                {unassignedCount > 3 && (
                  <span
                    className={styles.code}
                    style={{ fontSize: 10, opacity: 0.6 }}
                  >
                    +{unassignedCount - 3}
                  </span>
                )}
              </div>
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
