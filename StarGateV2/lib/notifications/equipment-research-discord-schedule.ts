import { after } from "next/server";

import { syncEquipmentResearchDiscordCard } from "@/lib/notifications/equipment-research-discord";

export function scheduleEquipmentResearchDiscordCardSync(
  projectKey: string,
): void {
  const run = async (): Promise<void> => {
    try {
      await syncEquipmentResearchDiscordCard(projectKey);
    } catch (error) {
      console.warn(
        `[research-discord] 카드 동기화 실행 실패 key=${projectKey}`,
        error,
      );
    }
  };
  try {
    after(run);
  } catch (error) {
    console.warn(
      `[research-discord] after() 예약 실패, cron 재시도 대기 key=${projectKey}`,
      error,
    );
  }
}
