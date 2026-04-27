"use client";

import Link from "next/link";
import { useMemo } from "react";

import type { SerializedSession } from "@/hooks/queries/useSessionsQuery";

import {
  DOW_EN,
  STATUS_LABEL,
  buildDiscordLink,
  ddayLabel,
  formatDuration,
  formatTime,
  isAttending,
  isSameDay,
  pad,
  statusModifier,
} from "./_utils";

import styles from "./page.module.css";

interface SessionsAgendaProps {
  sessions: SerializedSession[];
}

interface AgendaGroup {
  key: string;
  date: Date;
  isToday: boolean;
  items: SerializedSession[];
}

export default function SessionsAgenda({ sessions }: SessionsAgendaProps) {
  const groups = useMemo<AgendaGroup[]>(() => {
    const today = new Date();
    const todayStart = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );
    const cutoff = todayStart.getTime() - 24 * 60 * 60 * 1000; // include yesterday for D+1
    const upcoming = sessions
      .filter((s) => new Date(s.targetDateTime).getTime() >= cutoff)
      .slice()
      .sort(
        (a, b) =>
          new Date(a.targetDateTime).getTime() -
          new Date(b.targetDateTime).getTime(),
      );

    const map = new Map<string, AgendaGroup>();
    for (const s of upcoming) {
      const d = new Date(s.targetDateTime);
      const dayDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const existing = map.get(key);
      if (existing) {
        existing.items.push(s);
      } else {
        map.set(key, {
          key,
          date: dayDate,
          isToday: isSameDay(dayDate, todayStart),
          items: [s],
        });
      }
    }
    return Array.from(map.values());
  }, [sessions]);

  if (groups.length === 0) {
    return <div className={styles.empty}>다가올 세션이 없습니다.</div>;
  }

  return (
    <div className={styles.agenda}>
      {groups.map((g) => {
        const dow = g.date.getDay();
        const dowEn = DOW_EN[dow];
        const dowCls = [
          styles.dow,
          dow === 0 ? styles["dow--sun"] : "",
          dow === 6 ? styles["dow--sat"] : "",
        ]
          .filter(Boolean)
          .join(" ");
        const dayCls = [
          styles.agendaDay,
          g.isToday ? styles["agendaDay--today"] : "",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <div key={g.key} className={dayCls}>
            <div className={styles.agendaDate}>
              <div className={dowCls}>{dowEn}</div>
              <div className={styles.day}>{g.date.getDate()}</div>
              <div className={styles.ym}>
                {g.date.getFullYear()}.{pad(g.date.getMonth() + 1)}
              </div>
              {g.isToday ? (
                <div className={styles.todayMark}>TODAY</div>
              ) : null}
            </div>
            <div className={styles.agendaList}>
              {g.items.map((s) => {
                const mod = statusModifier(s.status);
                const rowCls = [
                  styles.agendaRow,
                  mod ? styles[`agendaRow--${mod}`] : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                const statCls = [
                  styles.agendaStat,
                  mod ? styles[`agendaStat--${mod}`] : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                const dur = formatDuration(s.targetDateTime, s.closeDateTime);
                return (
                  <Link
                    key={s._id}
                    href={buildDiscordLink(s)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={rowCls}
                  >
                    <div className={styles.agendaTime}>
                      {formatTime(s.targetDateTime)}
                      {dur ? <span className={styles.dur}>· {dur}</span> : null}
                    </div>
                    <div className={styles.agendaBody}>
                      <div className={styles.agendaTitle}>
                        {isAttending(s) ? (
                          <span className={styles.me} aria-label="내 참여" />
                        ) : null}
                        {s.title}
                      </div>
                      <div className={styles.agendaMeta}>
                        <span>{s.counts.yes}명 응답</span>
                        <span className={styles.sep}>·</span>
                        <span>NO {s.counts.no}</span>
                      </div>
                    </div>
                    <div className={statCls}>
                      <span className={styles.label}>
                        {STATUS_LABEL[s.status]}
                      </span>
                      <span className={styles.rsvp}>
                        {ddayLabel(s.targetDateTime)}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
