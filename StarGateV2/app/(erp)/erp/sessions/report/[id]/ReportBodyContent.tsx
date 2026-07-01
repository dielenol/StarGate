"use client";

import { useInternalLinkPendingNavigation } from "@/components/erp/NavPending/useInternalLinkPendingNavigation";

import styles from "./page.module.css";

interface ReportBodyContentProps {
  html: string;
}

export default function ReportBodyContent({ html }: ReportBodyContentProps) {
  const handleInternalLinkClick = useInternalLinkPendingNavigation();

  return (
    <div
      className={styles.reportBody}
      onClick={handleInternalLinkClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
