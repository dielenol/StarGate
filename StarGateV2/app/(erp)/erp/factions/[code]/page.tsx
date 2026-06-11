/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  IconAffinity,
  IconArrowLeft,
  IconArrowRight,
  IconContact,
  IconCredit,
  IconFactionBriefing,
  IconRelations,
  IconReportDocument,
} from "@/components/icons";
import Box from "@/components/ui/Box/Box";
import PageHead from "@/components/ui/PageHead/PageHead";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";
import Tag from "@/components/ui/Tag/Tag";

import { auth } from "@/lib/auth/config";

import {
  findFactionBoardNode,
  getFactionBoardData,
} from "../_data";
import {
  getFactionGameProfile,
  getNextRelationTier,
  getRelationProgress,
  getRelationTier,
  getRelationTierLabel,
  isHostileFaction,
} from "../_game";

import styles from "./page.module.css";

interface FactionDetailPageProps {
  params: Promise<{ code: string }>;
}

function displayCode(code: string) {
  return code.replace(/_/g, " ");
}

function formatFavorability(value: number | null) {
  return value === null ? "미등록" : value.toString();
}

function sigilFor(code: string) {
  return displayCode(code)
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2);
}

export default async function FactionDetailPage({
  params,
}: FactionDetailPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { code } = await params;
  const data = await getFactionBoardData(session.user.role);
  const node = findFactionBoardNode(data, code);
  if (!node) notFound();

  const hostile = isHostileFaction(node);
  const profile = getFactionGameProfile(node.code, node.kind);
  const tier = getRelationTier(node.favorability);
  const tierLabel = getRelationTierLabel(node.favorability, hostile);
  const nextTier = getNextRelationTier(node.favorability, hostile);
  const relationProgress = getRelationProgress(node.favorability);
  const pageToneClass = hostile ? styles["page--hostile"] : "";

  return (
    <>
      <PageHead
        title={`${node.label} 접선`}
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "세력도", href: "/erp/factions" },
          { label: node.label, href: `/erp/factions/${node.code.toLowerCase()}` },
        ]}
      />

      <div className={[styles.page, pageToneClass].filter(Boolean).join(" ")}>
        <Link className={styles.backLink} href="/erp/factions">
          <IconArrowLeft aria-hidden />
          <span>세력도로 복귀</span>
        </Link>

        <section className={styles.hero}>
          <div className={styles.hero__logoWrap}>
            {node.logoUrl ? (
              <img
                src={node.logoUrl}
                alt=""
                className={[
                  styles.hero__logo,
                  node.code === "SPACE_ZERO" ? styles["hero__logo--spaceZero"] : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              />
            ) : (
              <span className={styles.hero__sigil}>{sigilFor(node.code)}</span>
            )}
          </div>

          <div className={styles.hero__body}>
            <span className={styles.hero__code}>{displayCode(node.code)}</span>
            <h1>{node.label}</h1>
            <p>{node.doctrine}</p>
            <div className={styles.hero__tags}>
              <Tag tone={hostile ? "danger" : "gold"}>{node.scopeLabel}</Tag>
              <Tag>{node.summary}</Tag>
              {node.parentLabel ? <Tag>{node.parentLabel}</Tag> : null}
            </div>
          </div>

          <div className={styles.hero__score}>
            <span>우호도</span>
            <b>{formatFavorability(node.favorability)}</b>
            <small>-10 / 10</small>
          </div>
        </section>

        <div className={styles.layout}>
          <Box className={styles.panel} variant={hostile ? "solid" : "gold"}>
            <PanelTitle>
              <span className={styles.panelLabel}>
                <IconRelations aria-hidden />
                <span>관계 단계</span>
              </span>
            </PanelTitle>

            <div className={styles.relationHead}>
              <div>
                <span>{hostile ? "위협 통제" : "관계 상태"}</span>
                <strong>{tierLabel}</strong>
              </div>
              <b>{relationProgress}%</b>
            </div>

            <div className={styles.progressBar} aria-hidden>
              <span style={{ width: `${relationProgress}%` }} />
            </div>

            <p className={styles.relationSummary}>{tier.summary}</p>

            <div className={styles.nextTier}>
              <span>다음 단계</span>
              <strong>
                {nextTier
                  ? `${nextTier.label} · ${nextTier.points}점 필요`
                  : "최고 단계"}
              </strong>
            </div>
          </Box>

          <Box className={styles.panel}>
            <PanelTitle>
              <span className={styles.panelLabel}>
                <IconCredit aria-hidden />
                <span>혜택 트랙</span>
              </span>
            </PanelTitle>

            <div className={styles.benefitList}>
              {profile.benefits.map((benefit) => {
                const unlocked = (node.favorability ?? 0) >= benefit.min;
                return (
                  <div
                    key={benefit.label}
                    className={[
                      styles.benefit,
                      unlocked ? styles["benefit--unlocked"] : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <span>{benefit.min}+</span>
                    <strong>{benefit.label}</strong>
                    <p>{benefit.description}</p>
                  </div>
                );
              })}
            </div>
          </Box>
        </div>

        <Box className={styles.contactPanel}>
          <PanelTitle
            right={<span className={styles.panelCode}>{profile.operatorLabel}</span>}
          >
            <span className={styles.panelLabel}>
              <IconContact aria-hidden />
              <span>접선 콘솔</span>
            </span>
          </PanelTitle>

          <div className={styles.contactLead}>
            <IconFactionBriefing aria-hidden />
            <p>{profile.contactLine}</p>
          </div>

          <div className={styles.actionGrid}>
            {profile.actions.map((action) => (
              <button key={action.id} type="button" className={styles.actionCard}>
                <span>{action.channel}</span>
                <strong>{action.label}</strong>
                <p>{action.detail}</p>
                <small>{action.effectLabel}</small>
              </button>
            ))}
          </div>
        </Box>

        <Box className={styles.questPanel}>
          <PanelTitle right={<span className={styles.panelCode}>CANDIDATE</span>}>
            <span className={styles.panelLabel}>
              <IconReportDocument aria-hidden />
              <span>퀘스트 후보</span>
            </span>
          </PanelTitle>

          <div className={styles.questGrid}>
            {profile.quests.map((quest) => (
              <article key={quest.id} className={styles.questCard}>
                <div className={styles.questCard__head}>
                  <span>{quest.minimumFavorability}+</span>
                  <strong>{quest.title}</strong>
                </div>
                <p>{quest.summary}</p>
                <small>{quest.reward}</small>
              </article>
            ))}
          </div>

          <Link className={styles.returnCta} href="/erp/factions">
            <IconAffinity aria-hidden />
            <span>세력도에서 우호도 조정</span>
            <IconArrowRight aria-hidden />
          </Link>
        </Box>
      </div>
    </>
  );
}
