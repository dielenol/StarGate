"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { ClientSessionReport } from "@/types/session-report";

import { useUpdateReport } from "@/hooks/mutations/useReportMutation";
import { StaleVersionApiError } from "@/hooks/mutations/StaleVersionApiError";
import { useSessionReport } from "@/hooks/queries/useSessionReportsQuery";

import Button from "@/components/ui/Button/Button";
import Input from "@/components/ui/Input/Input";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";
import Row from "@/components/ui/Row/Row";
import Stack from "@/components/ui/Stack/Stack";

import styles from "../../new/page.module.css";

interface Props {
  report: ClientSessionReport;
}

function formatCoordinate(value?: number): string {
  return typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : "";
}

function initialRows(values: string[]): string[] {
  return values.length > 0 ? values : [""];
}

function hasStoredCoordinate(report: ClientSessionReport): boolean {
  return (
    typeof report.mapX === "number" &&
    Number.isFinite(report.mapX) &&
    typeof report.mapY === "number" &&
    Number.isFinite(report.mapY)
  );
}

function parseMapCoordinate(value: string): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) return null;
  return numeric;
}

export default function ReportEditForm({ report }: Props) {
  const router = useRouter();
  const updateReport = useUpdateReport();
  const reportQuery = useSessionReport(report._id, {
    initialData: report,
  });
  const latestReport = reportQuery.data ?? report;

  const [sessionTitle, setSessionTitle] = useState(report.sessionTitle);
  const [summary, setSummary] = useState(report.summary);
  const [highlights, setHighlights] = useState<string[]>(
    initialRows(report.highlights ?? []),
  );
  const [participants, setParticipants] = useState<string[]>(
    initialRows(report.participants ?? []),
  );
  const [locationLabel, setLocationLabel] = useState(
    report.locationLabel ?? "",
  );
  const [mapX, setMapX] = useState(formatCoordinate(report.mapX));
  const [mapY, setMapY] = useState(formatCoordinate(report.mapY));
  const [mapPrecision, setMapPrecision] = useState<"confirmed" | "estimated">(
    report.mapPrecision ?? "estimated",
  );
  const [baselineReport, setBaselineReport] = useState(report);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const externalChange =
    dirty && latestReport.updatedAt !== baselineReport.updatedAt;

  if (!dirty && latestReport.updatedAt !== baselineReport.updatedAt) {
    setSessionTitle(latestReport.sessionTitle);
    setSummary(latestReport.summary);
    setHighlights(initialRows(latestReport.highlights ?? []));
    setParticipants(initialRows(latestReport.participants ?? []));
    setLocationLabel(latestReport.locationLabel ?? "");
    setMapX(formatCoordinate(latestReport.mapX));
    setMapY(formatCoordinate(latestReport.mapY));
    setMapPrecision(latestReport.mapPrecision ?? "estimated");
    setBaselineReport(latestReport);
  }

  function reloadLatestReport() {
    setSessionTitle(latestReport.sessionTitle);
    setSummary(latestReport.summary);
    setHighlights(initialRows(latestReport.highlights ?? []));
    setParticipants(initialRows(latestReport.participants ?? []));
    setLocationLabel(latestReport.locationLabel ?? "");
    setMapX(formatCoordinate(latestReport.mapX));
    setMapY(formatCoordinate(latestReport.mapY));
    setMapPrecision(latestReport.mapPrecision ?? "estimated");
    setBaselineReport(latestReport);
    setDirty(false);
    setError(null);
  }

  const handleAddHighlight = () => {
    setDirty(true);
    setHighlights((prev) => [...prev, ""]);
  };

  const handleRemoveHighlight = (index: number) => {
    setDirty(true);
    setHighlights((prev) => prev.filter((_, i) => i !== index));
  };

  const handleHighlightChange = (index: number, value: string) => {
    setDirty(true);
    setHighlights((prev) => prev.map((h, i) => (i === index ? value : h)));
  };

  const handleAddParticipant = () => {
    setDirty(true);
    setParticipants((prev) => [...prev, ""]);
  };

  const handleRemoveParticipant = (index: number) => {
    setDirty(true);
    setParticipants((prev) => prev.filter((_, i) => i !== index));
  };

  const handleParticipantChange = (index: number, value: string) => {
    setDirty(true);
    setParticipants((prev) => prev.map((p, i) => (i === index ? value : p)));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedTitle = sessionTitle.trim();
    const trimmedSummary = summary.trim();
    const filteredHighlights = highlights
      .map((h) => h.trim())
      .filter((h) => h !== "");
    const filteredParticipants = participants
      .map((p) => p.trim())
      .filter((p) => p !== "");
    const trimmedLocationLabel = locationLabel.trim();
    const trimmedMapX = mapX.trim();
    const trimmedMapY = mapY.trim();
    const hadStoredCoordinate = hasStoredCoordinate(baselineReport);

    if (!trimmedTitle || !trimmedSummary) {
      setError("제목과 작전 본문은 비워둘 수 없습니다.");
      return;
    }

    if ((trimmedMapX && !trimmedMapY) || (!trimmedMapX && trimmedMapY)) {
      setError("지도 X/Y 좌표는 함께 입력해야 합니다.");
      return;
    }

    const mapFields: {
      mapX?: number | null;
      mapY?: number | null;
      mapPrecision?: "confirmed" | "estimated" | null;
    } = {};

    if (trimmedMapX && trimmedMapY) {
      const nextMapX = parseMapCoordinate(trimmedMapX);
      const nextMapY = parseMapCoordinate(trimmedMapY);
      if (nextMapX === null || nextMapY === null) {
        setError("지도 X/Y 좌표는 0부터 100 사이 숫자로 입력해야 합니다.");
        return;
      }
      mapFields.mapX = nextMapX;
      mapFields.mapY = nextMapY;
      mapFields.mapPrecision = mapPrecision;
    } else if (hadStoredCoordinate) {
      mapFields.mapX = null;
      mapFields.mapY = null;
      mapFields.mapPrecision = null;
    }

    updateReport.mutate(
      {
        id: report._id,
        expectedUpdatedAt: baselineReport.updatedAt ?? null,
        input: {
          sessionTitle: trimmedTitle,
          summary: trimmedSummary,
          highlights: filteredHighlights,
          participants: filteredParticipants,
          ...(trimmedLocationLabel
            ? { locationLabel: trimmedLocationLabel }
            : baselineReport.locationLabel
              ? { locationLabel: null }
              : {}),
          ...mapFields,
        },
      },
      {
        onSuccess: () => {
          router.push(`/erp/sessions/report/${report._id}`);
        },
        onError: (err) => {
          setError(err.message);
          if (err instanceof StaleVersionApiError) {
            void reportQuery.refetch();
          }
        },
      },
    );
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <Stack gap="var(--gap)">
        <div>
          <PanelTitle>OPERATION REPORT TITLE</PanelTitle>
          <Input
            type="text"
            value={sessionTitle}
            onChange={(e) => {
              setDirty(true);
              setSessionTitle(e.target.value);
            }}
            placeholder="작전 보고서 제목"
            required
            aria-label="작전 보고서 제목"
          />
        </div>

        <div>
          <PanelTitle>OPERATION SUMMARY</PanelTitle>
          <textarea
            className={styles.textarea}
            value={summary}
            onChange={(e) => {
              setDirty(true);
              setSummary(e.target.value);
            }}
            placeholder="작전 개요를 작성하세요..."
            rows={10}
            required
            aria-label="작전 개요"
          />
        </div>

        <div>
          <PanelTitle>MAP PIN</PanelTitle>
          <div className={styles.mapGrid}>
            <Input
              type="text"
              value={locationLabel}
              onChange={(e) => {
                setDirty(true);
                setLocationLabel(e.target.value);
              }}
              placeholder="표시 위치"
              aria-label="지도 표시 위치"
            />
            <Input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={mapX}
              onChange={(e) => {
                setDirty(true);
                setMapX(e.target.value);
              }}
              placeholder="X%"
              aria-label="지도 X 좌표"
            />
            <Input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={mapY}
              onChange={(e) => {
                setDirty(true);
                setMapY(e.target.value);
              }}
              placeholder="Y%"
              aria-label="지도 Y 좌표"
            />
            <select
              className={styles.select}
              value={mapPrecision}
              onChange={(e) => {
                setDirty(true);
                setMapPrecision(e.target.value as "confirmed" | "estimated")
              }}
              aria-label="지도 좌표 확정도"
            >
              <option value="confirmed">확정</option>
              <option value="estimated">추정</option>
            </select>
          </div>
        </div>

        <div>
          <PanelTitle
            right={<span className={styles.mono}>{highlights.length}</span>}
          >
            HIGHLIGHTS
          </PanelTitle>
          <Stack gap={6}>
            {highlights.map((h, i) => (
              <Row key={i} gap={6}>
                <Input
                  type="text"
                  value={h}
                  onChange={(e) => handleHighlightChange(i, e.target.value)}
                  placeholder={`하이라이트 ${i + 1}`}
                  aria-label={`하이라이트 ${i + 1}`}
                />
                {highlights.length > 1 ? (
                  <Button
                    onClick={() => handleRemoveHighlight(i)}
                    aria-label={`하이라이트 ${i + 1} 삭제`}
                  >
                    x
                  </Button>
                ) : null}
              </Row>
            ))}
            <Button onClick={handleAddHighlight} className={styles.addBtn}>
              + 하이라이트 추가
            </Button>
          </Stack>
        </div>

        <div>
          <PanelTitle
            right={<span className={styles.mono}>{participants.length}</span>}
          >
            PARTICIPANTS
          </PanelTitle>
          <Stack gap={6}>
            {participants.map((p, i) => (
              <Row key={i} gap={6}>
                <Input
                  type="text"
                  value={p}
                  onChange={(e) => handleParticipantChange(i, e.target.value)}
                  placeholder={`참여자 ${i + 1}`}
                  aria-label={`참여자 ${i + 1}`}
                />
                {participants.length > 1 ? (
                  <Button
                    onClick={() => handleRemoveParticipant(i)}
                    aria-label={`참여자 ${i + 1} 삭제`}
                  >
                    x
                  </Button>
                ) : null}
              </Row>
            ))}
            <Button onClick={handleAddParticipant} className={styles.addBtn}>
              + 참여자 추가
            </Button>
          </Stack>
        </div>

        {externalChange ? (
          <div className={styles.staleNotice} role="alert">
            <div>
              <strong>다른 사용자가 이 리포트를 수정했습니다.</strong>
              <span>
                작성 중인 내용은 보존했습니다. 최신본을 불러오기 전에는
                저장할 수 없습니다.
              </span>
            </div>
            <Button type="button" onClick={reloadLatestReport}>
              최신본 불러오기
            </Button>
          </div>
        ) : null}

        {error ? (
          <div className={styles.error} role="alert">
            {error}
          </div>
        ) : null}

        <Row gap={8} align="center" className={styles.submitRow}>
          <Button as="a" href={`/erp/sessions/report/${report._id}`}>
            취소
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={updateReport.isPending || externalChange}
          >
            {updateReport.isPending ? "저장 중..." : "변경사항 저장"}
          </Button>
        </Row>
      </Stack>
    </form>
  );
}
