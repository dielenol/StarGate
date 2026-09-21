import { requireGmPageSession } from "@/lib/auth/require-gm-page";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import PageHead from "@/components/ui/PageHead/PageHead";
import Tag from "@/components/ui/Tag/Tag";

import styles from "./page.module.css";

const PAGES = [
  { href: "/erp/missions", title: "미션 보드", description: "미션 게시·신청 화면" },
  { href: "/erp/chronicle", title: "연대기", description: "월드 타임라인·캐릭터 기록 화면" },
  { href: "/world/b", title: "세계관 B", description: "세계관 B 기록 페이지" },
  { href: "/world/c", title: "세계관 C", description: "세계관 C 기록 페이지" },
];

export default async function UnfinishedPagesPage() {
  await requireGmPageSession();

  return (
    <div data-pixel-font="ui">
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "미완성" },
        ]}
        title="미완성"
        right={<Tag tone="rank-gm">GM 전용</Tag>}
      />
      <p className={styles.archive__notice}>
        개발을 중단한 페이지를 보관합니다. GM만 열람할 수 있습니다.
      </p>
      <ul className={styles.archive__list}>
        {PAGES.map((page) => (
          <li key={page.href}>
            <Box className={styles.archive__card}>
              <h2 className={styles.archive__title}>{page.title}</h2>
              <p className={styles.archive__description}>{page.description}</p>
              <Button as="a" href={page.href}>
                {page.title} 열기
              </Button>
            </Box>
          </li>
        ))}
      </ul>
    </div>
  );
}
