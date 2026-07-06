"use client";

/* eslint-disable @next/next/no-img-element */

import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import Link from "next/link";

import Box from "@/components/ui/Box/Box";
import PageHead from "@/components/ui/PageHead/PageHead";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";
import Tag from "@/components/ui/Tag/Tag";
import {
  IconAffinity,
  IconArrowRight,
  IconFactionBriefing,
  IconFactionMap,
  IconHostile,
  IconRelations,
} from "@/components/icons";

import OrgIcon, { FACTION_ICON_MAP } from "../personnel/_components/OrgIcon";
import orgStyles from "../personnel/_components/OrgCanvas.module.css";
import styles from "./page.module.css";

export type FactionBoardCode = string;
export type FactionBoardNodeKind =
  | "external"
  | "branch"
  | "internal"
  | "hostile";

export interface FactionBoardNode {
  code: FactionBoardCode;
  label: string;
  labelEn: string;
  kind: FactionBoardNodeKind;
  scopeLabel: string;
  parentCode: FactionBoardCode | null;
  parentLabel?: string;
  summary: string;
  doctrine: string;
  briefingPoints?: readonly string[];
  logoUrl: string;
  favorability: number | null;
  memberCount: number;
  contactCount: number;
  wikiCount: number;
  signalCount: number;
  subUnitCount?: number;
}

export interface FactionBoardTotals {
  nodeCount: number;
  factionCount: number;
  internalCount: number;
  subOrgCount: number;
  memberCount: number;
  contactCount: number;
  wikiCount: number;
  signalCount: number;
}

export interface FactionBoardData {
  boardNodes: FactionBoardNode[];
  totals: FactionBoardTotals;
  generatedAt: string;
  canEditFavorability: boolean;
}

interface FactionsClientProps {
  data: FactionBoardData;
}

const DEFAULT_NODE: FactionBoardCode = "COUNCIL";
const FAVORABILITY_MIN = -10;
const FAVORABILITY_MAX = 10;

const ACTIONS = [
  {
    id: "formal",
    label: "공식 협조",
    channel: "FORMAL",
    detail: "사무국 검토 라인",
  },
  {
    id: "intel",
    label: "정보 교환",
    channel: "INTEL",
    detail: "위키·보고서 기반",
  },
  {
    id: "field",
    label: "현장 연락",
    channel: "FIELD",
    detail: "인물 접촉 후보",
  },
  {
    id: "neutral",
    label: "중립 브리핑",
    channel: "NEUTRAL",
    detail: "관계도 변동 없음",
  },
] as const;

type ActionId = (typeof ACTIONS)[number]["id"];

function getDensity(node: FactionBoardNode): number {
  return Math.min(
    100,
    node.memberCount * 12 +
      node.contactCount * 8 +
      node.wikiCount * 10 +
      node.signalCount * 14,
  );
}

function formatFavorability(value: number | null): string {
  return value === null ? "-" : value.toString();
}

function displayCode(code: string): string {
  return code.replace(/_/g, " ");
}

function favorabilityToneClass(value: number | null): string {
  if (value === null) return styles["favorability--neutral"];
  if (value > 0) return styles["favorability--positive"];
  if (value < 0) return styles["favorability--negative"];
  return styles["favorability--neutral"];
}

export default function FactionsClient({ data }: FactionsClientProps) {
  const [boardNodes, setBoardNodes] = useState(data.boardNodes);
  const [selectedCode, setSelectedCode] =
    useState<FactionBoardCode>(DEFAULT_NODE);
  const [selectedAction, setSelectedAction] = useState<ActionId>("formal");
  const [favorabilityDraft, setFavorabilityDraft] = useState("");
  const [favorabilityMessage, setFavorabilityMessage] = useState<string | null>(
    null,
  );
  const [isSavingFavorability, setIsSavingFavorability] = useState(false);
  const lastFavorabilityCodeRef = useRef<FactionBoardCode | null>(null);

  const nodesByCode = useMemo(() => {
    const entries = boardNodes.map((node) => [node.code, node] as const);
    return new Map<FactionBoardCode, FactionBoardNode>(entries);
  }, [boardNodes]);

  const selectedNode =
    nodesByCode.get(selectedCode) ?? boardNodes[0] ?? null;
  const selectedActionMeta =
    ACTIONS.find((action) => action.id === selectedAction) ?? ACTIONS[0];
  const density = selectedNode ? getDensity(selectedNode) : 0;
  const councilNode = nodesByCode.get("COUNCIL");
  const militaryNode = nodesByCode.get("MILITARY");
  const civilNode = nodesByCode.get("CIVIL");
  const externalBranchGroups = [
    {
      key: "military",
      label: "군부 하위 소속",
      nodes: boardNodes.filter(
        (node) => node.kind === "branch" && node.parentCode === "MILITARY",
      ),
    },
    {
      key: "civil",
      label: "시민사회 하위 소속",
      nodes: boardNodes.filter(
        (node) => node.kind === "branch" && node.parentCode === "CIVIL",
      ),
    },
  ].filter((group) => group.nodes.length > 0);
  const hostileNode = nodesByCode.get("HOSTILE");
  const hostileBranchNodes = boardNodes.filter(
    (node) => node.parentCode === "HOSTILE",
  );

  useEffect(() => {
    setFavorabilityDraft(
      selectedNode?.favorability === null ||
        typeof selectedNode?.favorability === "undefined"
        ? ""
        : selectedNode.favorability.toString(),
    );
    if (lastFavorabilityCodeRef.current !== (selectedNode?.code ?? null)) {
      setFavorabilityMessage(null);
      lastFavorabilityCodeRef.current = selectedNode?.code ?? null;
    }
  }, [selectedNode?.code, selectedNode?.favorability]);

  async function handleFavorabilitySubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    if (!selectedNode || !data.canEditFavorability || isSavingFavorability) {
      return;
    }

    const nextFavorability = Number(favorabilityDraft);
    if (
      !Number.isInteger(nextFavorability) ||
      nextFavorability < FAVORABILITY_MIN ||
      nextFavorability > FAVORABILITY_MAX
    ) {
      setFavorabilityMessage("-10부터 10까지의 정수만 저장할 수 있습니다.");
      return;
    }

    setIsSavingFavorability(true);
    setFavorabilityMessage(null);

    try {
      const res = await fetch("/api/erp/factions/favorability", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: selectedNode.code,
          favorability: nextFavorability,
        }),
      });

      const payload = (await res.json()) as {
        code?: string;
        favorability?: number;
        error?: string;
      };

      if (!res.ok || typeof payload.favorability !== "number" || !payload.code) {
        throw new Error(payload.error ?? "우호도 저장에 실패했습니다.");
      }

      setBoardNodes((nodes) =>
        nodes.map((node) =>
          node.code === payload.code
            ? { ...node, favorability: payload.favorability ?? null }
            : node,
        ),
      );
      setFavorabilityMessage("우호도를 저장했습니다.");
    } catch (err) {
      setFavorabilityMessage(
        err instanceof Error ? err.message : "우호도 저장에 실패했습니다.",
      );
    } finally {
      setIsSavingFavorability(false);
    }
  }

  function renderOrgNode(
    node: FactionBoardNode,
    options: { subOrg?: boolean; hostile?: boolean } = {},
  ) {
    const isActive = selectedCode === node.code;
    const isSubOrg = options.subOrg === true;
    const isHostile = options.hostile === true;
    const parentIcon =
      isSubOrg && node.parentCode
        ? FACTION_ICON_MAP[
            node.parentCode as keyof typeof FACTION_ICON_MAP
          ]
        : undefined;

    return (
      <button
        key={node.code}
        type="button"
        className={[
          orgStyles.node,
          orgStyles["node--lg"],
          isSubOrg ? orgStyles.subOrgNode : "",
          isHostile ? orgStyles.hostileNode : "",
          isActive ? styles.orgNodeActive : "",
        ]
          .filter(Boolean)
          .join(" ")}
        data-suborg={isSubOrg ? node.code : undefined}
        onClick={() => setSelectedCode(node.code)}
        aria-pressed={isActive}
      >
        <span className={orgStyles.tl} />
        <span className={orgStyles.br} />

        {node.logoUrl && !isHostile ? (
          <img
            src={node.logoUrl}
            alt=""
            className={orgStyles.node__watermark}
            aria-hidden
          />
        ) : null}

        {isHostile ? (
          <IconHostile
            className={[orgStyles.subOrgLogo, styles.hostileNodeIcon].join(
              " ",
            )}
            aria-hidden
          />
        ) : isSubOrg && node.logoUrl ? (
          <img
            src={node.logoUrl}
            alt=""
            className={orgStyles.subOrgLogo}
            aria-hidden
          />
        ) : isSubOrg && parentIcon ? (
          <OrgIcon
            code={parentIcon}
            size={24}
            className={orgStyles.subOrgLogo}
            aria-hidden
          />
        ) : null}

        <div className={orgStyles.node__header}>
          <div className={orgStyles.node__headerTop}>
            {!isSubOrg && node.logoUrl ? (
              <img
                src={node.logoUrl}
                alt=""
                className={styles.orgHeaderLogo}
                aria-hidden
              />
            ) : null}
            <div className={orgStyles.code}>{displayCode(node.code)}</div>
          </div>
          <div className={orgStyles.label}>{node.label}</div>
          {!isSubOrg && node.kind === "external" ? (
            <p className={styles.orgNodeSummary}>{node.scopeLabel}</p>
          ) : null}
          {isSubOrg && node.parentLabel ? (
            <div className={orgStyles.subOrgParent}>{node.parentLabel}</div>
          ) : null}
        </div>

        <div
          className={[
            orgStyles.node__section,
            favorabilityToneClass(node.favorability),
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <div
            className={[
              orgStyles.node__sectionLabel,
              styles.nodeSectionLabel,
            ].join(" ")}
          >
            <IconAffinity className={styles.nodeMetricIcon} aria-hidden />
            <span>우호도</span>
          </div>
          <div className={orgStyles.headcount}>
            <span className={orgStyles.headcount__n}>
              {formatFavorability(node.favorability)}
            </span>
            <span className={orgStyles.headcount__u}>
              {node.favorability === null ? "미등록" : "/ 10"}
            </span>
          </div>
        </div>
      </button>
    );
  }

  return (
    <div data-pixel-font="ui">
      <PageHead
        title="세력 현황"
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "세력도", href: "/erp/factions" },
        ]}
      />

      <div className={styles.page}>
        <div className={styles.board}>
          <Box className={styles.networkPanel}>
            <PanelTitle>
              <span className={styles.panelLabel}>
                <IconFactionMap className={styles.panelIcon} aria-hidden />
                <span>세력 관계도</span>
              </span>
            </PanelTitle>

            <div className={[orgStyles.canvas, styles.orgCanvas].join(" ")}>
              <div className={styles.orgInner}>
                <div className={orgStyles.externalArea}>
                  <div className={orgStyles.sectionTitle}>
                    외부 권력 블록 · EXTERNAL FACTIONS
                  </div>
                  <div className={orgStyles.externalNetwork}>
                    <div className={orgStyles.factions}>
                      <svg
                        className={orgStyles.crossfire}
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                        aria-hidden
                      >
                        <defs>
                          <marker
                            id="factionCrossfireArrow"
                            viewBox="0 0 10 10"
                            refX="9"
                            refY="5"
                            markerWidth="3"
                            markerHeight="3"
                            orient="auto-start-reverse"
                          >
                            <path
                              d="M0,0 L10,5 L0,10 z"
                              fill="var(--danger)"
                            />
                          </marker>
                        </defs>
                        <line
                          x1="50"
                          y1="18"
                          x2="20"
                          y2="82"
                          markerStart="url(#factionCrossfireArrow)"
                          markerEnd="url(#factionCrossfireArrow)"
                        />
                        <line
                          x1="50"
                          y1="18"
                          x2="80"
                          y2="82"
                          markerStart="url(#factionCrossfireArrow)"
                          markerEnd="url(#factionCrossfireArrow)"
                        />
                        <line
                          x1="20"
                          y1="82"
                          x2="80"
                          y2="82"
                          markerStart="url(#factionCrossfireArrow)"
                          markerEnd="url(#factionCrossfireArrow)"
                        />
                      </svg>
                      <span className={orgStyles.crossfireLabel} aria-hidden>
                        상호 감시 · MUTUAL OVERSIGHT
                      </span>

                      {councilNode ? renderOrgNode(councilNode) : null}
                      {militaryNode ? renderOrgNode(militaryNode) : null}
                      {civilNode ? renderOrgNode(civilNode) : null}
                    </div>

                    <div className={orgStyles.externalSubOrgGroups}>
                      {externalBranchGroups.map((group) => (
                        <div
                          key={group.key}
                          className={[
                            orgStyles.subOrgGroup,
                            orgStyles[`subOrgGroup--${group.key}`],
                          ].join(" ")}
                          role="group"
                          aria-label={group.label}
                        >
                          <svg
                            className={orgStyles.subOrgGroupConnector}
                            viewBox="0 0 100 44"
                            preserveAspectRatio="none"
                            aria-hidden
                          >
                            <path
                              d="M50 0 V26 M18 26 H82 M18 26 V44 M82 26 V44"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1"
                              strokeDasharray="4 6"
                              vectorEffect="non-scaling-stroke"
                            />
                          </svg>

                          {group.nodes.map((node) =>
                            renderOrgNode(node, { subOrg: true }),
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {hostileNode || hostileBranchNodes.length > 0 ? (
                  <div
                    className={orgStyles.hostileArea}
                    aria-label="적대세력"
                  >
                    <div className={orgStyles.sectionTitle}>
                      적대세력 · HOSTILE FACTIONS
                    </div>
                    <div className={orgStyles.hostileNodes}>
                      {hostileBranchNodes.length > 0
                        ? hostileBranchNodes.map((node) =>
                            renderOrgNode(node, {
                              subOrg: true,
                              hostile: true,
                            }),
                          )
                        : hostileNode
                          ? renderOrgNode(hostileNode, { hostile: true })
                          : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </Box>

          {selectedNode ? (
            <Box className={styles.detailPanel} variant="gold">
              <PanelTitle right={<Tag tone="info">{selectedNode.scopeLabel}</Tag>}>
                <span className={styles.panelLabel}>
                  <IconFactionBriefing
                    className={styles.panelIcon}
                    aria-hidden
                  />
                  <span>세력 브리핑</span>
                </span>
              </PanelTitle>

              <div className={styles.briefing}>
                <div className={styles.briefing__logoWrap}>
                  {selectedNode.logoUrl ? (
                    <img
                      src={selectedNode.logoUrl}
                      alt=""
                      className={[
                        styles.briefing__logo,
                        selectedNode.code === "SPACE_ZERO"
                          ? styles["briefing__logo--spaceZero"]
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    />
                  ) : (
                    <span className={styles.briefing__sigil}>
                      {displayCode(selectedNode.code).slice(0, 2)}
                    </span>
                  )}
                </div>
                <div className={styles.briefing__body}>
                  <span className={styles.briefing__code}>{selectedNode.code}</span>
                  <h2>{selectedNode.label}</h2>
                  <p>{selectedNode.doctrine}</p>
                  {selectedNode.briefingPoints?.length ? (
                    <ul className={styles.briefing__loreList}>
                      {selectedNode.briefingPoints.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                  ) : null}
                  <div className={styles.briefing__tags}>
                    <Tag
                      tone="gold"
                      className={[
                        styles.briefing__tag,
                        styles.briefing__summaryTag,
                      ].join(" ")}
                    >
                      {selectedNode.summary}
                    </Tag>
                    {selectedNode.parentLabel ? (
                      <Tag className={styles.briefing__tag}>
                        {selectedNode.parentLabel}
                      </Tag>
                    ) : null}
                    {selectedNode.subUnitCount ? (
                      <Tag className={styles.briefing__tag}>
                        {selectedNode.subUnitCount} 하위 기구
                      </Tag>
                    ) : null}
                  </div>
                  <Link
                    className={styles.briefing__detailLink}
                    href={`/erp/factions/${selectedNode.code.toLowerCase()}`}
                  >
                    <span>접선 페이지</span>
                    <IconArrowRight aria-hidden />
                  </Link>
                </div>
              </div>

              <div className={styles.density}>
                <div className={styles.density__head}>
                  <span className={styles.metricLabel}>
                    <IconRelations className={styles.metricIcon} aria-hidden />
                    <span>관계 연결도</span>
                  </span>
                  <b>{density}%</b>
                </div>
                <div className={styles.density__bar} aria-hidden>
                  <span style={{ width: `${density}%` }} />
                </div>
              </div>

              <div className={styles.detailStats}>
                <div className={favorabilityToneClass(selectedNode.favorability)}>
                  <span className={styles.metricLabel}>
                    <IconAffinity className={styles.metricIcon} aria-hidden />
                    <span>우호도</span>
                  </span>
                  <b>{formatFavorability(selectedNode.favorability)}</b>
                </div>
                <div>
                  <span>연락망</span>
                  <b>{selectedNode.contactCount}</b>
                </div>
                <div>
                  <span>문서</span>
                  <b>{selectedNode.wikiCount}</b>
                </div>
                <div>
                  <span>보고서</span>
                  <b>{selectedNode.signalCount}</b>
                </div>
              </div>

              {data.canEditFavorability ? (
                <form
                  className={styles.favorabilityEditor}
                  onSubmit={handleFavorabilitySubmit}
                >
                  <PanelTitle right={<span className={styles.panelCode}>GM</span>}>
                    우호도 조정
                  </PanelTitle>
                  <label className={styles.favorabilityEditor__field}>
                    <span>{selectedNode.label}</span>
                    <input
                      type="number"
                      min={FAVORABILITY_MIN}
                      max={FAVORABILITY_MAX}
                      step="1"
                      value={favorabilityDraft}
                      onChange={(event) =>
                        setFavorabilityDraft(event.currentTarget.value)
                      }
                      aria-label={`${selectedNode.label} 우호도`}
                    />
                  </label>
                  <div className={styles.favorabilityEditor__actions}>
                    <span>-10~10</span>
                    <button type="submit" disabled={isSavingFavorability}>
                      {isSavingFavorability ? "저장 중" : "저장"}
                    </button>
                  </div>
                  {favorabilityMessage ? (
                    <p className={styles.favorabilityEditor__message}>
                      {favorabilityMessage}
                    </p>
                  ) : null}
                </form>
              ) : null}

              <div className={styles.actionConsole}>
                <PanelTitle right={<span className={styles.panelCode}>LOCAL</span>}>
                  접촉 콘솔
                </PanelTitle>
                <div className={styles.actionGrid}>
                  {ACTIONS.map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      className={[
                        styles.actionButton,
                        selectedAction === action.id
                          ? styles["actionButton--active"]
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => setSelectedAction(action.id)}
                      aria-pressed={selectedAction === action.id}
                    >
                      <span>{action.channel}</span>
                      <b>{action.label}</b>
                    </button>
                  ))}
                </div>
                <div className={styles.actionPreview}>
                  <span>{selectedActionMeta.channel}</span>
                  <strong>
                    {selectedNode.label} · {selectedActionMeta.label}
                  </strong>
                  <p>{selectedActionMeta.detail}</p>
                </div>
              </div>
            </Box>
          ) : null}
        </div>
      </div>
    </div>
  );
}
