import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { findSessionsByMonth } from "@/lib/db/registrar-read";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import PageHead from "@/components/ui/PageHead/PageHead";

import SessionsClient from "./SessionsClient";

import styles from "./page.module.css";

export default async function SessionsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const guildId = process.env.GUILD_ID ?? "";

  let initialSessions: Awaited<ReturnType<typeof findSessionsByMonth>> = [];

  if (guildId) {
    try {
      initialSessions = await findSessionsByMonth(guildId, year, month);
    } catch {
      // registrar_bot DB 연결 실패 시 빈 배열 유지
    }
  }

  const serializedSessions = initialSessions.map((s) => ({
    ...s,
    _id: s._id?.toString() ?? "",
    targetDateTime: new Date(s.targetDateTime).toISOString(),
    closeDateTime: new Date(s.closeDateTime).toISOString(),
    createdAt: new Date(s.createdAt).toISOString(),
    updatedAt: new Date(s.updatedAt).toISOString(),
  }));

  return (
    <>
      <PageHead
        breadcrumb="ERP / SESSIONS"
        title="세션"
        right={
          <Button
            as="a"
            href="/erp/sessions/report"
            variant="primary"
          >
            리포트 →
          </Button>
        }
      />

      {!guildId ? (
        <Box>
          <div className={styles.empty}>
            GUILD_ID 환경변수가 설정되지 않았습니다.
          </div>
        </Box>
      ) : (
        <SessionsClient
          initialSessions={serializedSessions}
          initialYear={year}
          initialMonth={month}
          guildId={guildId}
        />
      )}
    </>
  );
}
