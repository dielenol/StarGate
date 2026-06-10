"use client";

/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from "react";

import Box from "@/components/ui/Box/Box";
import PageHead from "@/components/ui/PageHead/PageHead";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";
import Tag from "@/components/ui/Tag/Tag";

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
  const visibleGraphNodeCount = data.totals.factionCount + data.totals.subOrgCount;
  const councilNode = nodesByCode.get("COUNCIL");
  const militaryNode = nodesByCode.get("MILITARY");
  const civilNode = nodesByCode.get("CIVIL");
  const whiteRoseNode = nodesByCode.get("WHITE_ROSE");
  const spaceZeroNode = nodesByCode.get("SPACE_ZERO");

  function renderDiagramNode(node: FactionBoardNode, slot: string) {
    const isActive = selectedCode === node.code;

    return (
      <button
        key={node.code}
        type="button"
        className={[
          styles.graphNode,
          styles[`graphNode--${slot}`],
          isActive ? styles["graphNode--active"] : "",
        ]
          .filter(Boolean)
          .join(" ")}
        data-kind={node.kind}
        data-code={node.code}
        onClick={() => setSelectedCode(node.code)}
        aria-pressed={isActive}
      >
        <img
          src={node.logoUrl}
          alt=""
          className={styles.graphNode__watermark}
          aria-hidden
        />
        <span className={styles.graphNode__head}>
          <span className={styles.graphNode__meta}>
            <img src={node.logoUrl} alt="" className={styles.graphNode__icon} />
            <span>{node.code.replace("_", " ")}</span>
          </span>
          <strong>{node.label}</strong>
        </span>
        <span className={styles.graphNode__statLabel}>우호도</span>
        <span className={styles.graphNode__stat}>
          <b>{formatFavorability(node.favorability)}</b>
          <span>{node.favorability === null ? "미등록" : "/ 10"}</span>
        </span>
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
        <section className={styles.commandStrip} aria-label="세력 현황 요약">
          <div className={styles.commandStrip__title}>
            <span className={styles.commandStrip__kicker}>NOVUS ORDO</span>
            <h1>세력 관계도</h1>
          </div>
          <div className={styles.commandStrip__metrics}>
            <div className={styles.commandMetric}>
              <span>NODES</span>
              <b>{visibleGraphNodeCount}</b>
            </div>
            <div className={styles.commandMetric}>
              <span>BRANCHES</span>
              <b>{data.totals.subOrgCount}</b>
            </div>
            <div className={styles.commandMetric}>
              <span>CONTACTS</span>
              <b>{data.totals.contactCount}</b>
            </div>
            <div className={styles.commandMetric}>
              <span>RECORDS</span>
              <b>{data.totals.wikiCount + data.totals.signalCount}</b>
            </div>
          </div>
        </section>

        <div className={styles.board}>
          <Box className={styles.networkPanel}>
            <PanelTitle
              right={<span className={styles.panelCode}>EXTERNAL / BRANCHES</span>}
            >
              세력 관계도
            </PanelTitle>

            <div className={styles.networkCanvas}>
              <svg
                className={styles.graphLines}
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                aria-hidden
              >
                <path
                  className={styles.graphLines__primary}
                  d="M50 29 V36 M50 36 H23 M23 36 V39 M50 36 H77 M77 36 V39"
                />
                <path
                  className={styles.graphLines__branch}
                  d="M77 62 V70 M77 70 H34 M34 70 V73 M77 70 H84 M84 70 V73"
                />
              </svg>

              {councilNode ? renderDiagramNode(councilNode, "council") : null}

              {militaryNode ? renderDiagramNode(militaryNode, "military") : null}
              {civilNode ? renderDiagramNode(civilNode, "civil") : null}
              {whiteRoseNode ? renderDiagramNode(whiteRoseNode, "whiteRose") : null}
              {spaceZeroNode ? renderDiagramNode(spaceZeroNode, "spaceZero") : null}
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
                  <span>LINK DENSITY</span>
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
                  <span>CONTACTS</span>
                  <b>{selectedNode.contactCount}</b>
                </div>
                <div>
                  <span>WIKI</span>
                  <b>{selectedNode.wikiCount}</b>
                </div>
                <div>
                  <span>REPORTS</span>
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
