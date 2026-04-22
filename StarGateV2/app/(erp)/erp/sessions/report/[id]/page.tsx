import { redirect, notFound } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import { findReportById } from "@/lib/db/session-reports";
import { isValidObjectId } from "@/lib/db/utils";

import Box from "@/components/ui/Box/Box";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import PageHead from "@/components/ui/PageHead/PageHead";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";
import Stack from "@/components/ui/Stack/Stack";
import Tag from "@/components/ui/Tag/Tag";

import ReportActions from "./ReportActions";

import styles from "./page.module.css";

interface Props {
  params: Promise<{ id: string }>;
}

function fmtDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function SessionReportDetailPage({ params }: Props) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;
  if (!isValidObjectId(id)) notFound();

  const report = await findReportById(id);
  if (!report) {
    notFound();
  }

  const isGmOrAbove = hasRole(session.user.role, "V");
  const isAdmin = hasRole(session.user.role, "GM");
  const reportId = String(report._id);

  return (
    <>
      <PageHead
        breadcrumb={`ERP / SESSIONS / REPORTS / ${reportId.slice(-6).toUpperCase()}`}
        title={report.sessionTitle}
        right={
          isGmOrAbove || isAdmin ? (
            <ReportActions
              reportId={reportId}
              canEdit={isGmOrAbove}
              canDelete={isAdmin}
            />
          ) : null
        }
      />

      <div className={styles.layout}>
        <div className={styles.side}>
          <Box>
            <PanelTitle>METADATA</PanelTitle>
            <dl className={styles.kv}>
              <div className={styles.kv__row}>
                <dt>GM</dt>
                <dd className={styles.kv__gm}>{report.gmName}</dd>
              </div>
              <div className={styles.kv__row}>
                <dt>작성일</dt>
                <dd className={styles.mono}>{fmtDate(report.createdAt)}</dd>
              </div>
              {report.updatedAt &&
              new Date(report.updatedAt).getTime() !==
                new Date(report.createdAt).getTime() ? (
                <div className={styles.kv__row}>
                  <dt>수정일</dt>
                  <dd className={styles.mono}>{fmtDate(report.updatedAt)}</dd>
                </div>
              ) : null}
              <div className={styles.kv__row}>
                <dt>세션 ID</dt>
                <dd className={styles.mono}>{report.sessionId.slice(-8)}</dd>
              </div>
            </dl>
          </Box>

          {report.participants.length > 0 ? (
            <Box>
              <PanelTitle
                right={
                  <span className={styles.mono}>
                    {report.participants.length}
                  </span>
                }
              >
                PARTICIPANTS
              </PanelTitle>
              <Stack gap={6}>
                {report.participants.map((p, i) => (
                  <Tag key={i} tone="success">
                    {p}
                  </Tag>
                ))}
              </Stack>
            </Box>
          ) : null}
        </div>

        <div className={styles.main}>
          <Box>
            <PanelTitle>SUMMARY</PanelTitle>
            <p className={styles.body}>{report.summary || "—"}</p>
          </Box>

          {report.highlights.length > 0 ? (
            <Box>
              <PanelTitle
                right={
                  <span className={styles.mono}>
                    {report.highlights.length}
                  </span>
                }
              >
                HIGHLIGHTS
              </PanelTitle>
              <ul className={styles.list}>
                {report.highlights.map((h, i) => (
                  <li key={i} className={styles.list__item}>
                    <Eyebrow tone="gold" className={styles.list__num}>
                      {String(i + 1).padStart(2, "0")}
                    </Eyebrow>
                    <span className={styles.list__text}>{h}</span>
                  </li>
                ))}
              </ul>
            </Box>
          ) : null}
        </div>
      </div>
    </>
  );
}
