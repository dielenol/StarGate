import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import type { MasterItem } from "@stargate/shared-db/types";

import {
  CATALOG_SCOPE_HREF,
  ITEM_CATEGORY_LABEL,
  catalogScopeForItemCategory,
  categoryTone,
} from "@/lib/catalog/categories";
import {
  relatedReportsForCatalogItem,
  relatedWikiForCatalogItem,
} from "@/lib/catalog/related";
import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import { findMasterItemBySlugOrId } from "@/lib/db/inventory";
import { listSessionReports } from "@/lib/db/session-reports";
import { listWikiPages } from "@/lib/db/wiki";
import { formatDate } from "@/lib/format/date";
import { getConsumableItemImageSrc } from "@/lib/shop/item-images";
import { renderMarkdown } from "@/lib/wiki-render";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import PageHead from "@/components/ui/PageHead/PageHead";
import Tag, { type TagTone } from "@/components/ui/Tag/Tag";

import styles from "./page.module.css";

interface CatalogItemPageProps {
  params: Promise<{ key: string }>;
}

function itemKey(item: MasterItem): string {
  return item.slug ?? item._id?.toString() ?? "";
}

function formatPrice(price: number | string): string {
  const value = typeof price === "number" ? price : Number(price);
  if (!Number.isFinite(value)) return String(price);
  if (value === 0) return "비매품";
  return `₩${value.toLocaleString("ko-KR")}`;
}

function itemMarkdown(item: MasterItem): string {
  if (item.loreMd?.trim()) return item.loreMd;

  const sections = [
    ["설명", item.description],
    ["배경", item.lore?.background],
    ["획득 경로", item.lore?.acquisition],
    ["비고", item.lore?.notes],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]?.trim()));

  return sections
    .map(([heading, body]) => `## ${heading}\n${body.trim()}`)
    .join("\n\n");
}

function previewImage(item: MasterItem): string | null {
  const catalogSrc = getConsumableItemImageSrc(item.slug ?? "");
  if (catalogSrc) return catalogSrc;
  const src = item.previewImage?.trim();
  if (src && src.startsWith("/assets/")) return src;
  return null;
}

function itemTagTone(category: MasterItem["category"]): TagTone {
  const tone = categoryTone(category);
  if (tone === "equipment") return "gold";
  if (tone === "consumable") return "info";
  if (tone === "sample") return "success";
  return "danger";
}

export default async function CatalogItemPage({
  params,
}: CatalogItemPageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { key } = await params;
  const item = await findMasterItemBySlugOrId(decodeURIComponent(key));
  if (!item) notFound();

  const isCurator = hasRole(session.user.role, "V");
  if (item.isPublic === false && !isCurator) {
    notFound();
  }

  const scope = catalogScopeForItemCategory(item.category);
  const contentHtml = renderMarkdown(itemMarkdown(item));
  const image = previewImage(item);
  const tone = categoryTone(item.category);
  const itemIdentifier = itemKey(item) || "—";
  const primarySpec = item.effect ?? item.damage ?? "기록 없음";

  const [allPages, allReports] = await Promise.all([
    listWikiPages().catch(() => []),
    listSessionReports().catch(() => []),
  ]);
  const visiblePages = isCurator
    ? allPages
    : allPages.filter((page) => page.isPublic !== false);
  const relatedWiki = relatedWikiForCatalogItem(item, visiblePages);
  const relatedReports = relatedReportsForCatalogItem(item, allReports);

  return (
    <>
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "CATALOG", href: "/erp/wiki/catalog/all" },
          { label: ITEM_CATEGORY_LABEL[item.category] },
        ]}
        title={item.name}
        right={
          <Button as="a" href={CATALOG_SCOPE_HREF[scope]}>
            ← {ITEM_CATEGORY_LABEL[item.category]}
          </Button>
        }
      />

      <div className={styles.layout}>
        <div className={styles.body}>
          <Box className={styles.article} data-tone={tone}>
            <section className={styles.hero}>
              <div className={styles.hero__main}>
                <header className={styles.header}>
                  <div className={styles.header__tags}>
                    <Tag tone={itemTagTone(item.category)}>
                      {ITEM_CATEGORY_LABEL[item.category]}
                    </Tag>
                    <Tag tone={item.isPublic === false ? "danger" : "success"}>
                      {item.isPublic === false ? "PRIVATE" : "PUBLIC"}
                    </Tag>
                    <Tag tone={item.isAvailable ? "info" : "gold"}>
                      {item.isAvailable ? "지급 가능" : "보관 전용"}
                    </Tag>
                  </div>
                  <h2 className={styles.header__title}>{item.name}</h2>
                  {item.nameEn ? (
                    <p className={styles.header__subtitle}>{item.nameEn}</p>
                  ) : null}
                  <p className={styles.header__lead}>{item.description}</p>
                </header>

                <dl className={styles.quickFacts}>
                  <div>
                    <dt>PRICE</dt>
                    <dd>{formatPrice(item.price)}</dd>
                  </div>
                  <div>
                    <dt>STATUS</dt>
                    <dd>{item.isAvailable ? "AVAILABLE" : "ARCHIVE"}</dd>
                  </div>
                  <div>
                    <dt>
                      {item.effect ? "EFFECT" : item.damage ? "DAMAGE" : "SPEC"}
                    </dt>
                    <dd>{primarySpec}</dd>
                  </div>
                </dl>
              </div>

              <figure className={styles.figure}>
                <div className={styles.figure__frame}>
                  {image ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={image} alt={item.name} />
                  ) : (
                    <span className={styles.figure__placeholder} aria-hidden />
                  )}
                </div>
                <figcaption>{itemIdentifier}</figcaption>
              </figure>
            </section>

            <section
              className={styles.content}
              dangerouslySetInnerHTML={{ __html: contentHtml }}
            />

            <footer className={styles.footer}>
              <Link href={CATALOG_SCOPE_HREF[scope]} className={styles.back}>
                ← 카탈로그 목록
              </Link>
            </footer>
          </Box>
        </div>

        <aside className={styles.aside}>
          <Box className={styles.panel}>
            <Eyebrow tone="gold">CATALOG DATA</Eyebrow>
            <dl className={styles.infoList}>
              <InfoRow label="분류" value={ITEM_CATEGORY_LABEL[item.category]} />
              <InfoRow label="가격" value={formatPrice(item.price)} />
              <InfoRow label="식별자" value={itemKey(item) || "—"} />
              {item.effect ? <InfoRow label="효과" value={item.effect} /> : null}
              {item.damage ? (
                <InfoRow label="데미지" value={item.damage} />
              ) : null}
              <InfoRow
                label="상태"
                value={item.isAvailable ? "지급·구매 가능" : "비매품 / 보관 전용"}
              />
              <InfoRow
                label="생성일"
                value={formatDate(item.createdAt, "long")}
              />
              <InfoRow
                label="수정일"
                value={formatDate(item.updatedAt, "long")}
              />
            </dl>
          </Box>

          {item.tags && item.tags.length > 0 ? (
            <Box className={styles.panel}>
              <Eyebrow>KEYWORDS</Eyebrow>
              <div className={styles.tags}>
                {item.tags.map((tag) => (
                  <Tag key={tag}>{tag}</Tag>
                ))}
              </div>
            </Box>
          ) : null}

          <RelatedPanel
            title="RELATED WIKI"
            empty="관련 위키 문서가 없습니다."
            items={relatedWiki.map((page) => ({
              href: `/erp/wiki/${page.id}`,
              eyebrow: page.category,
              title: page.title,
            }))}
          />

          <RelatedPanel
            title="OPERATION REPORTS"
            empty="관련 작전 보고서가 없습니다."
            items={relatedReports.map((report) => ({
              href: `/erp/sessions/report/${report.id}`,
              eyebrow: report.sessionId,
              title: report.title,
              meta: report.locationLabel,
            }))}
          />
        </aside>
      </div>
    </>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.infoList__row}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function RelatedPanel({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: { href: string; eyebrow: string; title: string; meta?: string }[];
}) {
  return (
    <Box className={styles.panel}>
      <Eyebrow>{title}</Eyebrow>
      {items.length === 0 ? (
        <p className={styles.empty}>{empty}</p>
      ) : (
        <div className={styles.relatedList}>
          {items.map((item) => (
            <Link key={`${item.href}-${item.title}`} href={item.href} className={styles.related}>
              <span className={styles.related__eyebrow}>{item.eyebrow}</span>
              <strong>{item.title}</strong>
              {item.meta ? <small>{item.meta}</small> : null}
            </Link>
          ))}
        </div>
      )}
    </Box>
  );
}
