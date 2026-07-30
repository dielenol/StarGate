"use client";

import { useInternalLinkPendingNavigation } from "@/components/erp/NavPending/useInternalLinkPendingNavigation";
import { useSessionReport } from "@/hooks/queries/useSessionReportsQuery";
import type { ClientSessionReport } from "@/types/session-report";
import type { MarkdownLinkTarget } from "@/lib/wiki-render";
import { renderMarkdown } from "@/lib/wiki-render";

import Box from "@/components/ui/Box/Box";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";

import styles from "./page.module.css";

interface ReportBodyContentProps {
  initialReport: ClientSessionReport;
  links: MarkdownLinkTarget[];
}

export default function ReportBodyContent({
  initialReport,
  links,
}: ReportBodyContentProps) {
  const handleInternalLinkClick = useInternalLinkPendingNavigation();
  const { data: report = initialReport } = useSessionReport(
    initialReport._id,
    { initialData: initialReport },
  );
  const html = renderMarkdown(report.summary || "—", {
    links,
    maxAutoLinksPerTarget: 1,
    maxAutoLinksTotal: 32,
  });

  return (
    <>
      <Box className={styles.reportPanel}>
        <PanelTitle>작전 본문</PanelTitle>
        <div
          className={styles.reportBody}
          onClick={handleInternalLinkClick}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </Box>

      {report.highlights.length > 0 ? (
        <Box className={styles.reportPanel}>
          <PanelTitle
            right={
              <span className={styles.mono}>{report.highlights.length}</span>
            }
          >
            전개 기록
          </PanelTitle>
          <ul className={styles.list}>
            {report.highlights.map((highlight, index) => (
              <li key={index} className={styles.list__item}>
                <Eyebrow tone="gold" className={styles.list__num}>
                  {String(index + 1).padStart(2, "0")}
                </Eyebrow>
                <span className={styles.list__text}>{highlight}</span>
              </li>
            ))}
          </ul>
        </Box>
      ) : null}
    </>
  );
}
