export function formatOperationReportTitle(title: string): string {
  const trimmed = title.trim();

  return trimmed
    .replace(/^작전\s*기록\s*/u, "작전 보고서 ")
    .replace(/^세션\s*리포트\s*/u, "작전 보고서 ")
    .replace(/\s+/g, " ")
    .trim();
}

export type OperationReportSeries = "regular" | "mini";

export interface OperationReportNumberSource {
  _id?: unknown;
  sessionId: string;
  sessionTitle: string;
  createdAt: string | Date;
  reportNumber?: unknown;
}

export interface OperationReportNumberMeta<T extends OperationReportNumberSource> {
  report: T;
  series: OperationReportSeries;
  sequence: number;
  number: string;
}

interface OperationReportNumberPreset {
  series: OperationReportSeries;
  sequence: number;
  number: string;
  sortOrder: number;
}

const OPERATION_REPORT_NUMBER_PRESETS: Record<
  string,
  OperationReportNumberPreset
> = {
  "NOSB-S1E1-ORDER": {
    series: "regular",
    sequence: 1,
    number: "01",
    sortOrder: 10,
  },
  "NOSB-S1E1-MINI": {
    series: "regular",
    sequence: 1.5,
    number: "01.5",
    sortOrder: 20,
  },
  "NOSB-S1E2-CHOICE": {
    series: "regular",
    sequence: 2,
    number: "02",
    sortOrder: 30,
  },
  "NOSB-S1E2-MINI": {
    series: "regular",
    sequence: 2.5,
    number: "02.5",
    sortOrder: 40,
  },
  "NOSB-S1E3-PHANTOM": {
    series: "regular",
    sequence: 3,
    number: "03",
    sortOrder: 50,
  },
  "NOSB-S1E4-PRATO-PART1": {
    series: "regular",
    sequence: 4,
    number: "04",
    sortOrder: 60,
  },
  "NOSB-S1E4-PRATO-PART2": {
    series: "regular",
    sequence: 4.5,
    number: "04.5",
    sortOrder: 70,
  },
  "NOSB-S1E5-EVIL-PART1": {
    series: "regular",
    sequence: 5,
    number: "05",
    sortOrder: 80,
  },
  "NOSB-MINI-S1E1-NEW-DUBLIN": {
    series: "mini",
    sequence: 1,
    number: "MINI01",
    sortOrder: 110,
  },
  "NOSB-MINI-MINI-LEGACY": {
    series: "mini",
    sequence: 2,
    number: "MINI02",
    sortOrder: 120,
  },
  "NOSB-MINI-5959-CONTAINMENT": {
    series: "mini",
    sequence: 3,
    number: "MINI03",
    sortOrder: 130,
  },
  "NOSB-MINI-HWAYANGYEONHWA": {
    series: "mini",
    sequence: 4,
    number: "MINI04",
    sortOrder: 140,
  },
};

function reportIdentity(report: OperationReportNumberSource): string {
  const id =
    report._id && typeof report._id === "object" && "toString" in report._id
      ? report._id.toString()
      : report._id;

  return typeof id === "string" && id.trim() ? id : report.sessionId;
}

function reportTime(
  report: Pick<OperationReportNumberSource, "createdAt">,
): number {
  const time = new Date(report.createdAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

function normalizeReportTitle(title: string): string {
  return title.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

function getPresetByTitle(
  report: Pick<OperationReportNumberSource, "sessionTitle">,
): OperationReportNumberPreset | null {
  const title = normalizeReportTitle(report.sessionTitle);

  if (
    (title.includes("s1e5") || title.includes("악 1부")) &&
    /1\s*부|part\s*1/u.test(title)
  ) {
    return OPERATION_REPORT_NUMBER_PRESETS["NOSB-S1E5-EVIL-PART1"];
  }

  if (title.includes("프라토") && /2\s*부|part\s*2/u.test(title)) {
    return OPERATION_REPORT_NUMBER_PRESETS["NOSB-S1E4-PRATO-PART2"];
  }

  if (title.includes("프라토")) {
    return OPERATION_REPORT_NUMBER_PRESETS["NOSB-S1E4-PRATO-PART1"];
  }

  if (title.includes("s1e3") || title.includes("망령")) {
    return OPERATION_REPORT_NUMBER_PRESETS["NOSB-S1E3-PHANTOM"];
  }

  if (
    (title.includes("s1e2") && title.includes("미니")) ||
    title.includes("송사리")
  ) {
    return OPERATION_REPORT_NUMBER_PRESETS["NOSB-S1E2-MINI"];
  }

  if (title.includes("s1e2") || title.includes("선택")) {
    return OPERATION_REPORT_NUMBER_PRESETS["NOSB-S1E2-CHOICE"];
  }

  if (
    title.includes("s1e1") &&
    title.includes("질서") &&
    title.includes("미니")
  ) {
    return OPERATION_REPORT_NUMBER_PRESETS["NOSB-S1E1-MINI"];
  }

  if (title.includes("s1e1") || title.includes("질서")) {
    return OPERATION_REPORT_NUMBER_PRESETS["NOSB-S1E1-ORDER"];
  }

  if (
    title.includes("뉴 더블린") ||
    title.includes("new dublin") ||
    title.includes("네온 발키리")
  ) {
    return OPERATION_REPORT_NUMBER_PRESETS["NOSB-MINI-S1E1-NEW-DUBLIN"];
  }

  if (title.includes("유산") || title.includes("legacy")) {
    return OPERATION_REPORT_NUMBER_PRESETS["NOSB-MINI-MINI-LEGACY"];
  }

  if (title.includes("5959")) {
    return OPERATION_REPORT_NUMBER_PRESETS["NOSB-MINI-5959-CONTAINMENT"];
  }

  if (title.includes("화양연화") || title.includes("hwayang")) {
    return OPERATION_REPORT_NUMBER_PRESETS["NOSB-MINI-HWAYANGYEONHWA"];
  }

  return null;
}

function getReportPreset(
  report: Pick<OperationReportNumberSource, "sessionId" | "sessionTitle">,
): OperationReportNumberPreset | null {
  return (
    OPERATION_REPORT_NUMBER_PRESETS[report.sessionId] ?? getPresetByTitle(report)
  );
}

function getExplicitReportNumber(
  report: Partial<Pick<OperationReportNumberSource, "reportNumber">>,
): string | null {
  return typeof report.reportNumber === "string" && report.reportNumber.trim()
    ? report.reportNumber.trim()
    : null;
}

function getSeriesFromNumber(number: string): OperationReportSeries {
  return number.toUpperCase().startsWith("MINI") ? "mini" : "regular";
}

function parseReportSequence(
  number: string,
  fallback: number,
): number {
  const value = Number(number.replace(/^MINI/i, ""));
  return Number.isFinite(value) ? value : fallback;
}

function reportSortOrder(
  report: Pick<OperationReportNumberSource, "sessionId" | "sessionTitle">,
): number {
  return getReportPreset(report)?.sortOrder ?? Number.POSITIVE_INFINITY;
}

export function getOperationReportSeries(
  report: Pick<OperationReportNumberSource, "sessionId" | "sessionTitle"> &
    Partial<Pick<OperationReportNumberSource, "reportNumber">>,
): OperationReportSeries {
  const preset = getReportPreset(report);
  if (preset) return preset.series;

  const explicitNumber = getExplicitReportNumber(report);
  if (explicitNumber) return getSeriesFromNumber(explicitNumber);

  const text = `${report.sessionId} ${report.sessionTitle}`.toLowerCase();
  return text.includes("mini") || text.includes("미니") ? "mini" : "regular";
}

export function isMiniOperationReport(
  report: Pick<OperationReportNumberSource, "sessionId" | "sessionTitle"> &
    Partial<Pick<OperationReportNumberSource, "reportNumber">>,
): boolean {
  return getOperationReportSeries(report) === "mini";
}

export function formatOperationReportNumber(
  report: Pick<OperationReportNumberSource, "sessionId" | "sessionTitle"> &
    Partial<Pick<OperationReportNumberSource, "reportNumber">>,
  sequence: number,
): string {
  const preset = getReportPreset(report);
  if (preset) return preset.number;

  const explicitNumber = getExplicitReportNumber(report);
  if (explicitNumber) return explicitNumber;

  const [whole, fraction] = String(sequence).split(".");
  const number = `${whole.padStart(2, "0")}${fraction ? `.${fraction}` : ""}`;
  return isMiniOperationReport(report) ? `MINI${number}` : number;
}

export function buildOperationReportNumbering<T extends OperationReportNumberSource>(
  reports: readonly T[],
): OperationReportNumberMeta<T>[] {
  let regularSequence = 0;
  let miniSequence = 0;

  return [...reports]
    .sort(
      (left, right) =>
        reportSortOrder(left) - reportSortOrder(right) ||
        reportTime(left) - reportTime(right) ||
        left.sessionId.localeCompare(right.sessionId, "en"),
    )
    .map((report) => {
      const series = getOperationReportSeries(report);
      const preset = getReportPreset(report);
      const explicitNumber = preset?.number ?? getExplicitReportNumber(report);

      if (explicitNumber) {
        const sequence =
          preset?.sequence ??
          parseReportSequence(
            explicitNumber,
            series === "mini" ? miniSequence + 1 : regularSequence + 1,
          );

        if (series === "mini") {
          miniSequence = Math.max(miniSequence, Math.floor(sequence));
        } else {
          regularSequence = Math.max(regularSequence, Math.floor(sequence));
        }

        return {
          report,
          series,
          sequence,
          number: explicitNumber,
        };
      }

      const sequence = series === "mini" ? ++miniSequence : ++regularSequence;

      return {
        report,
        series,
        sequence,
        number: formatOperationReportNumber(report, sequence),
      };
    });
}

export function findOperationReportNumberMeta<T extends OperationReportNumberSource>(
  report: T,
  reports: readonly T[],
): OperationReportNumberMeta<T> {
  const targetIdentity = reportIdentity(report);
  const targetSessionId = report.sessionId;
  const meta = buildOperationReportNumbering(reports).find(
    (item) =>
      reportIdentity(item.report) === targetIdentity ||
      item.report.sessionId === targetSessionId,
  );

  if (meta) return meta;

  return {
    report,
    series: getOperationReportSeries(report),
    sequence: 1,
    number: formatOperationReportNumber(report, 1),
  };
}

export function formatShortReporterName(name: string): string {
  const trimmed = name.trim();
  const personName = trimmed.match(/([A-Z]\.\s*[A-Za-z][A-Za-z .'-]*)$/);

  if (personName) {
    return personName[1].replace(/\s+/g, " ");
  }

  return trimmed
    .replace(/^NOVUS ORDO\s*/i, "")
    .replace(/^사무국\s*/, "")
    .replace(/^기록통제실\s*/, "")
    .trim();
}
