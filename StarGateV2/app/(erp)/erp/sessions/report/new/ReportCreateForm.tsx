"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useCreateReport } from "@/hooks/mutations/useReportMutation";

import Button from "@/components/ui/Button/Button";
import Input from "@/components/ui/Input/Input";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";
import Row from "@/components/ui/Row/Row";
import Stack from "@/components/ui/Stack/Stack";

import styles from "./page.module.css";

export default function ReportCreateForm() {
  const router = useRouter();
  const createReport = useCreateReport();

  const [sessionTitle, setSessionTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [highlights, setHighlights] = useState<string[]>([""]);
  const [participants, setParticipants] = useState<string[]>([""]);
  const [locationLabel, setLocationLabel] = useState("");
  const [mapX, setMapX] = useState("");
  const [mapY, setMapY] = useState("");
  const [mapPrecision, setMapPrecision] = useState<"confirmed" | "estimated">(
    "estimated",
  );
  const [error, setError] = useState<string | null>(null);

  const handleAddHighlight = () => {
    setHighlights((prev) => [...prev, ""]);
  };

  const handleRemoveHighlight = (index: number) => {
    setHighlights((prev) => prev.filter((_, i) => i !== index));
  };

  const handleHighlightChange = (index: number, value: string) => {
    setHighlights((prev) => prev.map((h, i) => (i === index ? value : h)));
  };

  const handleAddParticipant = () => {
    setParticipants((prev) => [...prev, ""]);
  };

  const handleRemoveParticipant = (index: number) => {
    setParticipants((prev) => prev.filter((_, i) => i !== index));
  };

  const handleParticipantChange = (index: number, value: string) => {
    setParticipants((prev) => prev.map((p, i) => (i === index ? value : p)));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const filteredHighlights = highlights
      .map((h) => h.trim())
      .filter((h) => h !== "");
    const filteredParticipants = participants
      .map((p) => p.trim())
      .filter((p) => p !== "");
    const trimmedLocationLabel = locationLabel.trim();
    const trimmedMapX = mapX.trim();
    const trimmedMapY = mapY.trim();

    if ((trimmedMapX && !trimmedMapY) || (!trimmedMapX && trimmedMapY)) {
      setError("지도 X/Y 좌표는 함께 입력해야 합니다.");
      return;
    }

    const mapFields =
      trimmedMapX && trimmedMapY
        ? {
            mapX: Number(trimmedMapX),
            mapY: Number(trimmedMapY),
            mapPrecision,
          }
        : {};

    createReport.mutate(
      {
        sessionTitle: sessionTitle.trim(),
        summary: summary.trim(),
        highlights: filteredHighlights,
        participants: filteredParticipants,
        ...(trimmedLocationLabel
          ? { locationLabel: trimmedLocationLabel }
          : {}),
        ...mapFields,
      },
      {
        onSuccess: () => {
          router.push("/erp/sessions/report");
        },
        onError: (err) => {
          setError(err.message);
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
            onChange={(e) => setSessionTitle(e.target.value)}
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
            onChange={(e) => setSummary(e.target.value)}
            placeholder="작전 개요를 작성하세요..."
            rows={6}
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
              onChange={(e) => setLocationLabel(e.target.value)}
              placeholder="표시 위치"
              aria-label="지도 표시 위치"
            />
            <Input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={mapX}
              onChange={(e) => setMapX(e.target.value)}
              placeholder="X%"
              aria-label="지도 X 좌표"
            />
            <Input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={mapY}
              onChange={(e) => setMapY(e.target.value)}
              placeholder="Y%"
              aria-label="지도 Y 좌표"
            />
            <select
              className={styles.select}
              value={mapPrecision}
              onChange={(e) =>
                setMapPrecision(e.target.value as "confirmed" | "estimated")
              }
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
                    ✕
                  </Button>
                ) : null}
              </Row>
            ))}
            <Button
              onClick={handleAddHighlight}
              className={styles.addBtn}
            >
              ＋ 하이라이트 추가
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
                    ✕
                  </Button>
                ) : null}
              </Row>
            ))}
            <Button
              onClick={handleAddParticipant}
              className={styles.addBtn}
            >
              ＋ 참여자 추가
            </Button>
          </Stack>
        </div>

        {error ? (
          <div className={styles.error} role="alert">
            {error}
          </div>
        ) : null}

        <Row gap={8} align="center" className={styles.submitRow}>
          <Button
            type="submit"
            variant="primary"
            disabled={createReport.isPending}
          >
            {createReport.isPending ? "작성 중..." : "작전 보고서 작성"}
          </Button>
        </Row>
      </Stack>
    </form>
  );
}
