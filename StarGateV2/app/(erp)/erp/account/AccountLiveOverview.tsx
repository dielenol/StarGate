"use client";

import { useCurrentAccount } from "@/hooks/queries/useAccountQuery";
import type { CurrentAccountResponse } from "@/types/erp-realtime";

import {
  IconAccount,
  IconLinked,
  IconPasskey,
  IconStatus,
  IconTenure,
} from "@/components/icons";

import styles from "./page.module.css";

function daysSince(value: string | null): number | null {
  if (!value) return null;
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0 || Number.isNaN(diffMs)) return null;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export default function AccountLiveOverview({
  initialAccount,
}: {
  initialAccount: CurrentAccountResponse;
}) {
  const { data: account = initialAccount } = useCurrentAccount({
    initialData: initialAccount,
  });
  const statusActive = account.status === "ACTIVE";
  const discordConnected = Boolean(account.discordId);
  const pwChangedDays = daysSince(account.passwordChangedAt);
  const accountAgeDays = daysSince(account.createdAt);

  return (
    <section className={styles.overviewPanel} aria-label="계정 요약">
      <div className={styles.overviewPanel__body}>
        <span className={styles.sectionLabel}>
          <IconAccount className={styles.sectionLabel__icon} aria-hidden />
          ACCOUNT CONTROL
        </span>
        <h2 className={styles.overviewPanel__title}>{account.displayName}</h2>
        <div className={styles.overviewPanel__meta}>
          <span>{account.username}</span>
          <span>{account.role}</span>
          <span>{account.status}</span>
        </div>
      </div>
      <div className={styles.summaryGrid}>
        <div className={styles.summaryItem}>
          <span className={styles.summaryItem__label}>
            <IconStatus className={styles.summaryItem__icon} aria-hidden />
            STATUS
          </span>
          <strong
            className={[
              styles.summaryItem__value,
              statusActive ? styles["summaryItem__value--success"] : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {account.status}
          </strong>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryItem__label}>
            <IconLinked className={styles.summaryItem__icon} aria-hidden />
            DISCORD
          </span>
          <strong
            className={[
              styles.summaryItem__value,
              discordConnected ? styles["summaryItem__value--gold"] : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {discordConnected ? "LINKED" : "OPEN"}
          </strong>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryItem__label}>
            <IconPasskey className={styles.summaryItem__icon} aria-hidden />
            PASSWORD
          </span>
          <strong className={styles.summaryItem__value}>
            {pwChangedDays !== null ? `${pwChangedDays}D` : "N/A"}
          </strong>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryItem__label}>
            <IconTenure className={styles.summaryItem__icon} aria-hidden />
            TENURE
          </span>
          <strong className={styles.summaryItem__value}>
            {accountAgeDays !== null ? `${accountAgeDays}D` : "N/A"}
          </strong>
        </div>
      </div>
    </section>
  );
}
