"use client";

import { useRef, useState } from "react";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";
import Tag from "@/components/ui/Tag/Tag";
import { useCreateBureaucratVote } from "@/hooks/mutations/useBureaucratVoteMutation";
import {
  BureaucratVoteApiError,
  useBureaucratVotes,
} from "@/hooks/queries/useBureaucratVotesQuery";
import type {
  BureaucratVotesResponse,
  SerializedBureaucratVote,
} from "@/lib/bureaucrat-votes/contracts";
import {
  clearRetainedIdempotencyOperation,
  retainIdempotencyOperation,
  type RetainedIdempotencyOperation,
} from "@/lib/query/idempotency";

import styles from "./page.module.css";

interface Props {
  initialData: BureaucratVotesResponse;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusLabel(vote: SerializedBureaucratVote): string {
  if (vote.status === "CLOSED") {
    return vote.resolution?.outcome === "APPROVED" ? "가결" : "부결";
  }
  if (vote.publication.state === "SENT") return "투표 진행 중";
  if (vote.publication.state === "DISPATCHING") return "Discord 등재 중";
  return "Discord 등재 대기";
}

function statusTone(vote: SerializedBureaucratVote) {
  if (vote.status === "OPEN") return "info" as const;
  return vote.resolution?.outcome === "APPROVED"
    ? "success" as const
    : "danger" as const;
}

export default function BureaucratVotesAdminClient({ initialData }: Props) {
  const { data = initialData, isFetching } = useBureaucratVotes({ initialData });
  const createVote = useCreateBureaucratVote();
  const retainedOperation = useRef<RetainedIdempotencyOperation | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function createPresetVote(presetKey: string, title: string) {
    if (
      !window.confirm(
        `관료 채널에 다음 안건을 등재합니다.\n\n${title}\n\n생성 즉시 6시간 자동 마감 시계가 시작됩니다. 계속하시겠습니까?`,
      )
    ) {
      return;
    }
    setNotice(null);
    setError(null);
    const operation = retainIdempotencyOperation(
      retainedOperation.current,
      "bureaucrat-vote",
      presetKey,
    );
    retainedOperation.current = operation;
    createVote.mutate(
      { presetKey, operationId: operation.key },
      {
        onSuccess: ({ vote }) => {
          retainedOperation.current = clearRetainedIdempotencyOperation(
            retainedOperation.current,
            operation.key,
          );
          setNotice(
            vote.publication.state === "SENT"
              ? "안건이 관료 채널에 게시되었습니다."
              : "안건을 원장에 등재했습니다. REGISTRAR가 관료 채널 게시를 자동 처리합니다.",
          );
        },
        onError: (caught) => {
          setError(
            caught instanceof BureaucratVoteApiError || caught instanceof Error
              ? caught.message
              : "안건 등재에 실패했습니다.",
          );
        },
      },
    );
  }

  return (
    <main className={styles.root}>
      <Box variant="gold" className={styles.noticePanel}>
        <Eyebrow tone="gold">SECRETARIAT · REGISTRAR</Eyebrow>
        <h2>확정 안건을 관료 채널로 등재합니다.</h2>
        <p>
          ERP는 안건 원장만 생성합니다. Discord 게시는 REGISTRAR가 처리하며,
          모든 표결은 생성 시각부터 6시간 뒤 자동 종료됩니다.
        </p>
        <p className={styles.boundary}>
          가결은 권한 승인만 기록합니다. 공방 재료 차감·제작 착수·완성품 지급은
          이 화면에서 실행하지 않습니다.
        </p>
        {!data.configured ? (
          <p className={styles.error}>GUILD_ID가 없어 현재 안건을 등재할 수 없습니다.</p>
        ) : null}
      </Box>

      {notice ? <p className={styles.success}>{notice}</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}

      <section className={styles.section}>
        <PanelTitle right={isFetching ? "원장 갱신 중" : "고정 안건"}>
          표결 안건
        </PanelTitle>
        <div className={styles.presetGrid}>
          {data.presets.map((preset) => {
            const activeVote = data.votes.find(
              (vote) => vote.presetKey === preset.key && vote.status === "OPEN",
            );
            return (
              <Box key={preset.key} className={styles.presetCard}>
                <div className={styles.cardHeader}>
                  <div>
                    <Eyebrow>{preset.category}</Eyebrow>
                    <h3>{preset.title}</h3>
                  </div>
                  <Tag tone={activeVote ? "info" : "default"}>
                    {activeVote ? statusLabel(activeVote) : "등재 가능"}
                  </Tag>
                </div>
                <p className={styles.summary}>{preset.summary}</p>
                <pre className={styles.preview}>{preset.content}</pre>
                <div className={styles.cardFooter}>
                  <span>자동 마감 · {data.durationHours}시간</span>
                  <Button
                    variant="primary"
                    disabled={
                      !data.configured ||
                      Boolean(activeVote) ||
                      createVote.isPending
                    }
                    onClick={() => createPresetVote(preset.key, preset.title)}
                  >
                    {activeVote ? "진행 중 안건 있음" : "관료 채널에 안건 등재"}
                  </Button>
                </div>
              </Box>
            );
          })}
        </div>
      </section>

      <section className={styles.section}>
        <PanelTitle right={`${data.votes.length}건`}>최근 표결 원장</PanelTitle>
        {data.votes.length === 0 ? (
          <Box className={styles.empty}>아직 생성된 관료 표결이 없습니다.</Box>
        ) : (
          <div className={styles.voteList}>
            {data.votes.map((vote) => {
              const discordHref =
                data.discordGuildId && vote.publication.messageId
                  ? `https://discord.com/channels/${data.discordGuildId}/${data.discordChannelId}/${vote.publication.messageId}`
                  : null;
              return (
                <Box key={vote.id} className={styles.voteRow}>
                  <div className={styles.voteRowMain}>
                    <div className={styles.voteTitleLine}>
                      <strong>{vote.title}</strong>
                      <Tag tone={statusTone(vote)}>{statusLabel(vote)}</Tag>
                    </div>
                    <p>
                      찬성 {vote.tally.yes} · 반대 {vote.tally.no} · 마감 {formatDateTime(vote.closesAt)}
                    </p>
                    <small>
                      {vote.createdBy.displayName} · {formatDateTime(vote.createdAt)} · 원장 {vote.id}
                    </small>
                  </div>
                  {discordHref ? (
                    <Button as="a" href={discordHref} target="_blank" rel="noreferrer" size="sm">
                      Discord 공지 열기
                    </Button>
                  ) : (
                    <span className={styles.pendingLabel}>게시 대기</span>
                  )}
                </Box>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
