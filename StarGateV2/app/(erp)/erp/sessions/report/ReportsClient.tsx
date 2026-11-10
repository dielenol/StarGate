"use client";

import Link from "next/link";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import type { ClientSessionReportListItem } from "@/lib/format/session-report-list";

import { useSessionReports } from "@/hooks/queries/useSessionReportsQuery";

import { formatDate } from "@/lib/format/date";
import {
  formatOperationReportTitle,
  formatShortReporterName,
} from "@/lib/format/session-report";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";
import {
  IconChevronLeft,
  IconChevronRight,
  IconReportDocument,
  IconReportMini,
} from "@/components/icons";
import LinkPendingProbe from "@/components/erp/NavPending/LinkPendingProbe";

import styles from "./page.module.css";

interface Props {
  initialReports: ClientSessionReportListItem[];
  initialReportsUpdatedAt?: number;
}

interface PinCardLayout {
  x: number;
  y: number;
  labelX?: number;
  labelY?: number;
}

const REPORT_CARD_SIZE = 66;
const DEFAULT_PIN_CARD_LAYOUT: PinCardLayout = { x: 0, y: -106 };
const REPORT_PIN_CARD_LAYOUTS: Record<string, PinCardLayout> = {
  "01.5": { x: -82, y: -112 },
  "02": { x: 86, y: -112 },
  "02.5": { x: 88, y: -92 },
  "03": { ...DEFAULT_PIN_CARD_LAYOUT, labelX: -34 },
  "04": { x: -86, y: -112, labelX: -132 },
  "04.5": { x: 86, y: -96, labelX: 132 },
  "05": { x: -86, y: -112, labelX: -132 },
  "05.5": { x: 86, y: -96, labelX: 106 },
  "06": { x: -86, y: -112, labelX: -132 },
  "06.5": { x: 86, y: -96, labelX: 132 },
  // 파리 회차는 유럽 MINI 카드와 겹치지 않도록 아래 행에 배치한다.
  "07": { x: 88, y: 56, labelX: -132 },
  "07.5": { x: 176, y: 56, labelX: -132 },
  "08": { x: -82, y: 36, labelX: -48, labelY: 114 },
  // 뉴욕만의 기존 카드 사이에 배치해 브라질 쪽 카드와 분리한다.
  "08.5": { x: -105, y: -38, labelX: -48, labelY: 114 },
  // 뉴욕 기준점의 왼쪽으로 펼쳐 브라질 카드와 모바일 지도 경계를 피한다.
  "09": { x: -154, y: 40, labelX: -54, labelY: 114 },
  "09.5": { x: -153, y: -121, labelX: -54, labelY: 114 },
  MINI01: { x: -92, y: -112 },
  // 최소 지도 폭에서도 주변 정규 회차의 카드와 번호를 가리지 않게 분산한다.
  MINI02: { x: 20, y: 120, labelY: 0 },
  MINI03: { x: 0, y: -112 },
  MINI04: { x: 70, y: -34, labelY: 42 },
  MINI05: { x: 24, y: -160, labelX: 132 },
  MINI06: { x: -16, y: -165, labelX: 132 },
  MINI07: { x: -32, y: 36 },
  "MINI07.5": { x: 32, y: 36 },
};

function getPinCardLayout(reportNumber: string): PinCardLayout {
  return REPORT_PIN_CARD_LAYOUTS[reportNumber] ?? DEFAULT_PIN_CARD_LAYOUT;
}

function getPinLineStyle(layout: PinCardLayout) {
  const lineX = layout.x;
  const lineY = layout.y + REPORT_CARD_SIZE;
  const length = Math.max(18, Math.hypot(lineX, lineY));
  const angle = Math.atan2(lineX, -lineY) * (180 / Math.PI);

  return {
    "--pin-card-x": `${layout.x}px`,
    "--pin-card-y": `${layout.y}px`,
    "--pin-line-length": `${length.toFixed(4)}px`,
    "--pin-line-angle": `${angle.toFixed(4)}deg`,
    "--pin-label-x": `${Math.round(layout.labelX ?? layout.x / 2)}px`,
    "--pin-label-y": `${layout.labelY ?? 18}px`,
  };
}

type MapScrollPosition = "fit" | "start" | "middle" | "end";

function ReportMapViewport({ children }: { children: ReactNode }) {
  const viewportId = useId();
  const hintId = useId();
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const overviewWindowRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<MapScrollPosition>("fit");
  const canScroll = position !== "fit";

  useEffect(() => {
    const viewport = viewportRef.current;
    const stage = stageRef.current;
    const overviewWindow = overviewWindowRef.current;
    if (!viewport || !stage || !overviewWindow) return;

    const updatePosition = () => {
      const { clientWidth, scrollWidth } = viewport;
      const maxScroll = scrollWidth - clientWidth;
      if (maxScroll <= 1) {
        setPosition("fit");
        return;
      }

      const offset = Math.min(maxScroll, Math.max(0, viewport.scrollLeft));
      overviewWindow.style.left = `${(offset / scrollWidth) * 100}%`;
      overviewWindow.style.width = `${(clientWidth / scrollWidth) * 100}%`;

      if (offset <= 1) setPosition("start");
      else if (maxScroll - offset <= 1) setPosition("end");
      else setPosition("middle");
    };

    const observer = new ResizeObserver(updatePosition);
    observer.observe(viewport);
    observer.observe(stage);
    viewport.addEventListener("scroll", updatePosition, { passive: true });

    return () => {
      observer.disconnect();
      viewport.removeEventListener("scroll", updatePosition);
    };
  }, []);

  function move(direction: -1 | 1) {
    const viewport = viewportRef.current;
    const atEdge = direction === -1 ? position === "start" : position === "end";
    if (viewport && !atEdge) {
      viewport.scrollBy({ left: direction * viewport.clientWidth * 0.8 });
    }
  }

  return (
    <>
      <div className={styles.mapNavigation} hidden={!canScroll}>
        <p className={styles.mapHint} id={hintId}>
          <strong>지도 이동</strong>
          <span>좌우로 밀기</span>
        </p>
        <div className={styles.mapControls}>
          <Button
            className={styles.mapStep}
            aria-label="지도를 왼쪽으로 이동"
            aria-controls={viewportId}
            aria-disabled={position === "start"}
            onClick={() => move(-1)}
          >
            <IconChevronLeft aria-hidden />
          </Button>
          <div className={styles.mapOverview} aria-hidden>
            <div className={styles.mapOverviewWindow} ref={overviewWindowRef} />
          </div>
          <Button
            className={styles.mapStep}
            aria-label="지도를 오른쪽으로 이동"
            aria-controls={viewportId}
            aria-disabled={position === "end"}
            onClick={() => move(1)}
          >
            <IconChevronRight aria-hidden />
          </Button>
        </div>
      </div>
      <div
        className={styles.mapViewport}
        id={viewportId}
        ref={viewportRef}
        role="region"
        aria-label="작전 보고서 지도"
        aria-describedby={canScroll ? hintId : undefined}
        tabIndex={canScroll ? 0 : undefined}
      >
        <div className={styles.mapStage} ref={stageRef} role="list">
          {children}
        </div>
      </div>
    </>
  );
}

export default function ReportsClient({
  initialReports,
  initialReportsUpdatedAt,
}: Props) {
  const { data: reports = [] } = useSessionReports({
    initialData: initialReports,
    initialDataUpdatedAt: initialReportsUpdatedAt,
  });

  return (
    <Box className={styles.mapBox} data-pixel-font="ui">
      <PanelTitle
        right={<span className={styles.mono}>{reports.length} 건</span>}
      >
        OPERATION REPORT MAP
      </PanelTitle>

      {reports.length === 0 ? (
        <div className={styles.empty}>작성된 작전 보고서가 없습니다.</div>
      ) : (
        <ReportMapViewport>
          <div className={styles.mapOverlay} aria-hidden />
          {reports.map((report) => {
            const id = report._id;
            const point = report.mapPoint;
            const reportNumber = report.number;
            const { series } = report;
            const pinLayout = getPinCardLayout(reportNumber);
            const reporterName = formatShortReporterName(report.gmName);
            const displayTitle = formatOperationReportTitle(
              report.sessionTitle,
            );
            const ReportIcon =
              series === "mini" ? IconReportMini : IconReportDocument;
            const style = {
              "--x": `${point.x}%`,
              "--y": `${point.y}%`,
              ...getPinLineStyle(pinLayout),
            } as CSSProperties;

            return (
              <Link
                key={id}
                href={`/erp/sessions/report/${id}`}
                className={[
                  styles.mapPin,
                  reportNumber.length > 2 ? styles["mapPin--wideNumber"] : "",
                  series === "mini" ? styles["mapPin--mini"] : "",
                  point.precision === "estimated"
                    ? styles["mapPin--estimated"]
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={style}
                role="listitem"
                aria-label={`${point.label} ${formatDate(report.createdAt, "padded")} ${displayTitle} 열기`}
              >
                <LinkPendingProbe />
                <span className={styles.mapPin__report}>
                  <ReportIcon className={styles.reportIcon} aria-hidden />
                  <span className={styles.mapPin__number}>
                    {reportNumber}
                  </span>
                </span>
                <span className={styles.mapPin__stem} aria-hidden />
                <span className={styles.mapPin__dot} aria-hidden />
                <span className={styles.mapPin__label}>
                  <span className={styles.mapPin__date}>
                    {formatDate(report.createdAt, "padded")}
                  </span>
                  <span className={styles.mapPin__title}>
                    {displayTitle}
                  </span>
                  <span className={styles.mapPin__place}>{point.label}</span>
                  <span className={styles.mapPin__reporter}>
                    보고자 - {reporterName}
                  </span>
                </span>
              </Link>
            );
          })}
        </ReportMapViewport>
      )}
    </Box>
  );
}
