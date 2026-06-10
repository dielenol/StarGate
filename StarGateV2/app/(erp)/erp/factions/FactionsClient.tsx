"use client";

/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from "react";

import Box from "@/components/ui/Box/Box";
import PageHead from "@/components/ui/PageHead/PageHead";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";
import Tag from "@/components/ui/Tag/Tag";

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
}

interface FactionsClientProps {
  data: FactionBoardData;
}

const DEFAULT_NODE: FactionBoardCode = "COUNCIL";

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

export default function FactionsClient({ data }: FactionsClientProps) {
  const [selectedCode, setSelectedCode] =
    useState<FactionBoardCode>(DEFAULT_NODE);
  const [selectedAction, setSelectedAction] = useState<ActionId>("formal");

  const nodesByCode = useMemo(() => {
    const entries = data.boardNodes.map((node) => [node.code, node] as const);
    return new Map<FactionBoardCode, FactionBoardNode>(entries);
  }, [data.boardNodes]);

  const selectedNode =
    nodesByCode.get(selectedCode) ?? data.boardNodes[0] ?? null;
  const selectedActionMeta =
    ACTIONS.find((action) => action.id === selectedAction) ?? ACTIONS[0];
  const density = selectedNode ? getDensity(selectedNode) : 0;
  const councilNode = nodesByCode.get("COUNCIL");
  const militaryNode = nodesByCode.get("MILITARY");
  const civilNode = nodesByCode.get("CIVIL");
  const whiteRoseNode = nodesByCode.get("WHITE_ROSE");
  const spaceZeroNode = nodesByCode.get("SPACE_ZERO");

  function renderOrgNode(
    node: FactionBoardNode,
    options: { subOrg?: boolean } = {},
  ) {
    const isActive = selectedCode === node.code;
    const isSubOrg = options.subOrg === true;

    return (
      <button
        key={node.code}
        type="button"
        className={[
          orgStyles.node,
          orgStyles["node--lg"],
          isSubOrg ? orgStyles.subOrgNode : "",
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

        <img
          src={node.logoUrl}
          alt=""
          className={orgStyles.node__watermark}
          aria-hidden
        />

        {isSubOrg ? (
          <img
            src={node.logoUrl}
            alt=""
            className={orgStyles.subOrgLogo}
            aria-hidden
          />
        ) : null}

        <div className={orgStyles.node__header}>
          <div className={orgStyles.node__headerTop}>
            {!isSubOrg ? (
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
          {isSubOrg && node.parentLabel ? (
            <div className={orgStyles.subOrgParent}>{node.parentLabel}</div>
          ) : null}
        </div>

        <div className={orgStyles.node__section}>
          <div className={orgStyles.node__sectionLabel}>우호도</div>
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
    <>
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
            <PanelTitle>세력 관계도</PanelTitle>

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

                    <div
                      className={orgStyles.civilSubOrgs}
                      aria-label="시민사회 하위 조직"
                    >
                      <svg
                        className={orgStyles.civilSubOrgConnector}
                        viewBox="0 0 100 72"
                        preserveAspectRatio="none"
                        aria-hidden
                      >
                        <path
                          d="M50 0 V28 M22 28 H78 M22 28 V72 M78 28 V72"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1"
                          strokeDasharray="4 6"
                          vectorEffect="non-scaling-stroke"
                        />
                      </svg>

                      {whiteRoseNode
                        ? renderOrgNode(whiteRoseNode, { subOrg: true })
                        : null}
                      {spaceZeroNode
                        ? renderOrgNode(spaceZeroNode, { subOrg: true })
                        : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Box>

          {selectedNode ? (
            <Box className={styles.detailPanel} variant="gold">
              <PanelTitle right={<Tag tone="info">{selectedNode.scopeLabel}</Tag>}>
                세력 브리핑
              </PanelTitle>

              <div className={styles.briefing}>
                <div className={styles.briefing__logoWrap}>
                  <img
                    src={selectedNode.logoUrl}
                    alt=""
                    className={styles.briefing__logo}
                  />
                </div>
                <div className={styles.briefing__body}>
                  <span className={styles.briefing__code}>{selectedNode.code}</span>
                  <h2>{selectedNode.label}</h2>
                  <p>{selectedNode.doctrine}</p>
                  <div className={styles.briefing__tags}>
                    <Tag tone="gold">{selectedNode.summary}</Tag>
                    {selectedNode.parentLabel ? (
                      <Tag>{selectedNode.parentLabel}</Tag>
                    ) : null}
                    {selectedNode.subUnitCount ? (
                      <Tag>{selectedNode.subUnitCount} 하위 기구</Tag>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className={styles.density}>
                <div className={styles.density__head}>
                  <span>관계 연결도</span>
                  <b>{density}%</b>
                </div>
                <div className={styles.density__bar} aria-hidden>
                  <span style={{ width: `${density}%` }} />
                </div>
              </div>

              <div className={styles.detailStats}>
                <div>
                  <span>우호도</span>
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
    </>
  );
}
