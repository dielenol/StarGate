"use client";

import Image from "next/image";
import Link from "next/link";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { IconArrowRight } from "@/components/icons";
import { resolvePublicAssetPath } from "@/lib/asset-path";
import styles from "./ArchiveViewer.module.css";

const RECORDS = [
  {
    key: "convention",
    tab: "기구 문장",
    code: "01 / CONVENTION",
    title: "질서를 수호하는 이름",
    detail: "NOVUS ORDO · EST. 1945",
    src: "/assets/StarGate_logo.webp",
    alt: "노부스 오르도 문장",
    href: "#convention",
    action: "기구 소개 읽기",
  },
  {
    key: "world",
    tab: "세계 지도",
    code: "02 / WORLD ARCHIVE",
    title: "우리가 마주한 세계",
    detail: "세계관 기록 · WORLD DOSSIER",
    src: "/assets/world-view/novus-ordo-world-map.webp",
    alt: "노부스 오르도 세계 지도",
    href: "/world",
    action: "세계관 기록 열람",
  },
  {
    key: "leadership",
    tab: "사무총장",
    code: "03 / LEADERSHIP",
    title: "아말리아 프레드리카 본 에센",
    detail: "제7대 노부스 오르도 사무총장",
    src: "/assets/npcs/Amalia-Fredrika-profile.webp",
    alt: "아말리아 프레드리카 본 에센 초상화",
    href: "#leadership",
    action: "사무총장 기록 읽기",
  },
];

export default function ArchiveViewer() {
  const [selected, setSelected] = useState(0);
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();

  function handleKeys(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === "ArrowRight") next = (index + 1) % RECORDS.length;
    else if (event.key === "ArrowLeft")
      next = (index + RECORDS.length - 1) % RECORDS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = RECORDS.length - 1;
    else return;
    event.preventDefault();
    setSelected(next);
    tabsRef.current[next]?.focus();
  }

  return (
    <div className={styles.viewer}>
      <div className={styles.viewer__head}>
        <span>ARCHIVE VIEWER</span>
        <span>기록 미리보기 / 03</span>
      </div>
      <div
        className={styles.viewer__tabs}
        role="tablist"
        aria-label="기밀 기록 미리보기"
      >
        {RECORDS.map((record, index) => (
          <button
            key={record.key}
            ref={(element) => {
              tabsRef.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${index}`}
            aria-controls={`${id}-panel-${index}`}
            aria-selected={selected === index}
            tabIndex={selected === index ? 0 : -1}
            onClick={() => setSelected(index)}
            onKeyDown={(event) => handleKeys(event, index)}
          >
            <span aria-hidden="true">0{index + 1}</span>
            {record.tab}
          </button>
        ))}
      </div>
      {RECORDS.map((record, index) => (
        <div
          key={record.key}
          role="tabpanel"
          id={`${id}-panel-${index}`}
          aria-labelledby={`${id}-tab-${index}`}
          hidden={selected !== index}
          tabIndex={0}
          className={styles.viewer__panel}
          data-record={record.key}
        >
          <div className={styles.viewer__stage}>
            <span className={styles.viewer__reference} aria-hidden="true">
              {record.code}
            </span>
            <div className={styles.viewer__reticle} aria-hidden="true" />
            <Image
              src={resolvePublicAssetPath(record.src)}
              alt={record.alt}
              fill
              sizes="(max-width: 700px) 85vw, (max-width: 1100px) 42vw, 520px"
              priority={index === 0}
              className={styles.viewer__image}
            />
            <span className={styles.viewer__stamp} aria-hidden="true">
              NOVUS
              <br />
              ORDO
            </span>
          </div>
          <div className={styles.viewer__caption}>
            <p>{record.detail}</p>
            <h2>{record.title}</h2>
            <Link href={record.href} prefetch={false}>
              {record.action}
              <IconArrowRight aria-hidden />
            </Link>
          </div>
        </div>
      ))}
      <div className={styles.viewer__foot}>
        <span>PROPERTY OF N.O. CONVENTION</span>
        <span>SELECT A RECORD ↑</span>
      </div>
    </div>
  );
}
