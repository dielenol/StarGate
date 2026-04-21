import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { findCharacterById, listCharactersByOwner } from "@/lib/db/characters";
import { getUserBalance } from "@/lib/db/credits";
import { listUserNotifications } from "@/lib/db/notifications";
import { findUpcomingSessions } from "@/lib/db/registrar-read";
import { listWikiPages } from "@/lib/db/wiki";

import type { NotificationType } from "@/types/notification";
import type { SessionStatus } from "@/types/session";

import Bar from "@/components/ui/Bar/Bar";
import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import PageHead from "@/components/ui/PageHead/PageHead";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";
import Seal from "@/components/ui/Seal/Seal";
import Spread from "@/components/ui/Spread/Spread";
import Stack from "@/components/ui/Stack/Stack";
import Tag from "@/components/ui/Tag/Tag";

import styles from "./page.module.css";

const NOTIFICATION_TAG: Record<
  NotificationType,
  { label: string; tone: "gold" | "info" | "success" | "default" }
> = {
  SESSION_REMIND: { label: "세션", tone: "gold" },
  ROLE_CHANGE: { label: "역할", tone: "info" },
  CREDIT_RECEIVED: { label: "크레딧", tone: "success" },
  REPORT_PUBLISHED: { label: "리포트", tone: "gold" },
  SYSTEM: { label: "시스템", tone: "default" },
};

const SESSION_STATUS_TAG: Record<
  SessionStatus,
  { label: string; tone: "gold" | "info" | "success" | "danger" | "default" }
> = {
  OPEN: { label: "모집중", tone: "gold" },
  CLOSING: { label: "마감 임박", tone: "info" },
  CLOSED: { label: "확정", tone: "success" },
  CANCELING: { label: "취소 예정", tone: "danger" },
  CANCELED: { label: "취소", tone: "danger" },
};

function fmtDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}

function fmtTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export default async function ERPDashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const userId = session.user.id;
  const guildId = process.env.GUILD_ID ?? "";

  const [myCharRefs, balance, notifications, upcomingSessions, wikiPages] =
    await Promise.all([
      listCharactersByOwner(userId).catch(() => []),
      getUserBalance(userId).catch(() => 0),
      listUserNotifications(userId, 3).catch(() => []),
      guildId
        ? findUpcomingSessions(guildId, 3).catch(() => [])
        : Promise.resolve([]),
      listWikiPages().catch(() => []),
    ]);

  const firstCharRef = myCharRefs[0];
  const myChar = firstCharRef?._id
    ? await findCharacterById(String(firstCharRef._id)).catch(() => null)
    : null;
  const recentWikis = [...wikiPages]
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
    .slice(0, 3);

  const lastSync = fmtTime(new Date());

  return (
    <>
      <PageHead
        breadcrumb="ERP / HOME"
        title="대시보드"
        right={
          <>
            <Tag>LAST SYNC · {lastSync} KST</Tag>
          </>
        }
      />

      <div className={styles.row3}>
        {/* MY CHARACTER */}
        <Box>
          <PanelTitle
            right={
              myChar ? (
                <span className={styles.mono}>{myChar.codename}</span>
              ) : null
            }
          >
            MY CHARACTER
          </PanelTitle>
          {myChar ? (
            <>
              <div className={styles.char}>
                <Seal>
                  {(myChar.sheet.name || myChar.codename).charAt(0).toUpperCase()}
                </Seal>
                <div className={styles.char__body}>
                  <Eyebrow tone="gold">{myChar.codename}</Eyebrow>
                  <div className={styles.char__name}>
                    {myChar.sheet.name || myChar.codename}
                  </div>
                  <div className={styles.char__sub}>
                    {myChar.role}
                    {myChar.department ? ` · ${myChar.department}` : ""}
                  </div>
                  {myChar.type === "AGENT" ? (
                    <Stack gap={6} className={styles.char__stats}>
                      <div className={styles.stat}>
                        <span className={styles.stat__label}>HP</span>
                        <Bar value={myChar.sheet.hp} className={styles.stat__bar} />
                        <span className={styles.stat__value}>
                          {myChar.sheet.hp}
                        </span>
                      </div>
                      <div className={styles.stat}>
                        <span className={styles.stat__label}>SAN</span>
                        <Bar
                          value={myChar.sheet.san}
                          tone="info"
                          className={styles.stat__bar}
                        />
                        <span className={styles.stat__value}>
                          {myChar.sheet.san}
                        </span>
                      </div>
                    </Stack>
                  ) : null}
                </div>
              </div>
              <Button
                as="a"
                href={`/erp/characters/${String(myChar._id)}`}
                className={styles.char__cta}
              >
                시트 열기 →
              </Button>
            </>
          ) : (
            <div className={styles.empty}>
              등록된 캐릭터가 없습니다.
              <Button as="a" href="/erp/characters" size="sm">
                캐릭터 목록 →
              </Button>
            </div>
          )}
        </Box>

        {/* CREDITS */}
        <Box>
          <PanelTitle right={<span className={styles.mono}>WALLET</span>}>
            CREDITS
          </PanelTitle>
          <div className={styles.bigNum}>¤ {balance.toLocaleString()}</div>
          <div className={styles.credits__actions}>
            <Button as="a" href="/erp/credits" size="sm">
              내역 →
            </Button>
          </div>
        </Box>

        {/* RECENT NOTIFICATIONS */}
        <Box>
          <PanelTitle
            right={
              <Link href="/erp/notifications" className={styles.panelLink}>
                전체 →
              </Link>
            }
          >
            RECENT NOTIFICATIONS
          </PanelTitle>
          {notifications.length === 0 ? (
            <div className={styles.empty}>새 알림 없음</div>
          ) : (
            <Stack gap={10} className={styles.notifList}>
              {notifications.map((n) => {
                const meta = NOTIFICATION_TAG[n.type];
                return (
                  <Spread key={String(n._id)} gap={10}>
                    <span className={styles.notifLine}>
                      <Tag tone={meta.tone}>{meta.label}</Tag>
                      <span className={styles.notifText}>{n.title}</span>
                    </span>
                    <span className={styles.mono}>{fmtTime(n.createdAt)}</span>
                  </Spread>
                );
              })}
            </Stack>
          )}
        </Box>
      </div>

      <div className={styles.rowWideNarrow}>
        {/* UPCOMING SESSIONS */}
        <Box>
          <PanelTitle
            right={
              <Link href="/erp/sessions" className={styles.panelLink}>
                달력 →
              </Link>
            }
          >
            UPCOMING SESSIONS · 이번 주
          </PanelTitle>
          {upcomingSessions.length === 0 ? (
            <div className={styles.empty}>예정된 세션이 없습니다.</div>
          ) : (
            <Stack gap={10}>
              {upcomingSessions.map((s) => {
                const meta = SESSION_STATUS_TAG[s.status] ?? {
                  label: s.status,
                  tone: "default" as const,
                };
                return (
                  <div key={String(s._id)} className={styles.sessionCard}>
                    <div className={styles.sessionCard__code}>
                      <div className={styles.sessionCard__codeMain}>
                        {fmtDate(s.targetDateTime)}
                      </div>
                      <div className={styles.sessionCard__codeSub}>
                        {fmtTime(s.targetDateTime)}
                      </div>
                    </div>
                    <div className={styles.sessionCard__body}>
                      <div className={styles.sessionCard__title}>{s.title}</div>
                    </div>
                    <div className={styles.sessionCard__meta}>
                      <Tag tone={meta.tone}>{meta.label}</Tag>
                    </div>
                  </div>
                );
              })}
            </Stack>
          )}
        </Box>

        {/* DISCORD BRIDGE */}
        <Box variant="gold">
          <PanelTitle right={<span className={styles.mono}>SYNC</span>}>
            <span className={styles.gold}>DISCORD BRIDGE</span>
          </PanelTitle>
          <dl className={styles.kv}>
            <div className={styles.kv__row}>
              <dt>Guild</dt>
              <dd>NOVUS ORDO · 본부</dd>
            </div>
            <div className={styles.kv__row}>
              <dt>Bot</dt>
              <dd className={styles.mono}>registra-bot</dd>
            </div>
            <div className={styles.kv__row}>
              <dt>Last sync</dt>
              <dd className={styles.mono}>{lastSync}</dd>
            </div>
          </dl>
        </Box>
      </div>

      {/* RECENT WIKI CHANGES */}
      <Box>
        <PanelTitle
          right={
            <Link href="/erp/wiki" className={styles.panelLink}>
              전체 →
            </Link>
          }
        >
          RECENT WIKI CHANGES
        </PanelTitle>
        {recentWikis.length === 0 ? (
          <div className={styles.empty}>최근 변경 내역 없음</div>
        ) : (
          <Stack gap={8}>
            {recentWikis.map((w) => (
              <Spread key={String(w._id)} gap={10}>
                <Link
                  href={`/erp/wiki/${String(w._id)}`}
                  className={styles.wikiLink}
                >
                  {w.title}
                </Link>
                <span className={styles.mono}>{fmtDate(w.updatedAt)}</span>
              </Spread>
            ))}
          </Stack>
        )}
      </Box>
    </>
  );
}
