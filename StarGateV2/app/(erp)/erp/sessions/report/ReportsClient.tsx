"use client";

import Link from "next/link";

import type { SessionReport } from "@/types/session-report";

import { useSessionReports } from "@/hooks/queries/useSessionReportsQuery";

import { formatDate } from "@/lib/format/date";

import Box from "@/components/ui/Box/Box";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";

import styles from "./page.module.css";

interface Props {
  initialReports: SessionReport[];
}

export default function ReportsClient({ initialReports }: Props) {
  const { data: reports = [] } = useSessionReports({
    initialData: initialReports,
  });

  return (
    <Box>
      <PanelTitle
        right={<span className={styles.mono}>{reports.length} 건</span>}
      >
        REPORT LOG
      </PanelTitle>

      {reports.length === 0 ? (
        <div className={styles.empty}>작성된 세션 리포트가 없습니다.</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>작전명</th>
                <th>GM</th>
                <th className={styles.dateCol}>작성일</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => {
                const id = String(report._id);
                return (
                  <tr key={id}>
                    <td className={styles.titleCol}>
                      <Link
                        href={`/erp/sessions/report/${id}`}
                        className={styles.titleLink}
                      >
                        {report.sessionTitle}
                      </Link>
                      {report.summary ? (
                        <div className={styles.summary}>
                          {report.summary.length > 120
                            ? `${report.summary.slice(0, 120)}...`
                            : report.summary}
                        </div>
                      ) : null}
                    </td>
                    <td className={styles.gmCol}>{report.gmName}</td>
                    <td className={`${styles.dateCol} ${styles.mono}`}>
                      {formatDate(report.createdAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Box>
  );
}
