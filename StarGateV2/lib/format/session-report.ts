export function formatOperationReportTitle(title: string): string {
  const trimmed = title.trim();

  return trimmed
    .replace(/^작전\s*기록\s*/u, "작전 보고서 ")
    .replace(/^세션\s*리포트\s*/u, "작전 보고서 ")
    .replace(/\s+/g, " ")
    .trim();
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
