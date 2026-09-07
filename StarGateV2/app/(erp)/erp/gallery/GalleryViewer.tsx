"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { IconChevronLeft, IconChevronRight, IconClose, IconZoom } from "@/components/icons";
import type { GalleryAlbumDto, GalleryItemDto } from "@/types/gallery";
import styles from "./viewer.module.css";

interface Props {
  items: GalleryItemDto[];
  item: GalleryItemDto;
  album: GalleryAlbumDto | null;
  index: number;
  onClose: () => void;
  onSelect: (id: string) => void;
}

export default function GalleryViewer({ items, item, album, index, onClose, onSelect }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [zoomedId, setZoomedId] = useState<string | null>(null);
  const [loadedImage, setLoadedImage] = useState<{ id: string; ratio: number } | null>(null);
  const ratio = loadedImage?.id === item.id ? loadedImage.ratio : (item.image.width ?? 1600) / (item.image.height ?? 1200);
  const zoomed = zoomedId === item.id;
  const hasNavigation = items.length > 1;
  const firstThumbnail = Math.max(0, Math.min(index - 3, items.length - 7));
  const thumbnails = items.slice(firstThumbnail, firstThumbnail + 7);
  const description = item.description.trim();
  const navigate = (offset: number) => {
    setZoomedId(null);
    onSelect(items[(index + offset + items.length) % items.length].id);
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    closeButtonRef.current?.focus({ preventScroll: true });
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  return <dialog
    className={styles.viewer}
    ref={dialogRef}
    aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    onKeyDown={(event) => {
      if (!hasNavigation || zoomed || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        navigate(event.key === "ArrowLeft" ? -1 : 1);
      }
    }}
  >
    <div className={styles.viewer__shell}>
      <header className={styles.toolbar}>
        <div className={styles.navigation}>
          <button className={styles.iconButton} onClick={() => navigate(-1)} disabled={!hasNavigation} aria-label="이전 이미지"><IconChevronLeft /></button>
          <span className={styles.counter} aria-label={`${items.length}개 중 ${index + 1}번째 이미지`}><strong>{String(index + 1).padStart(2, "0")}</strong><span>/ {items.length}</span></span>
          <button className={styles.iconButton} onClick={() => navigate(1)} disabled={!hasNavigation} aria-label="다음 이미지"><IconChevronRight /></button>
        </div>
        <div className={styles.tools}>
          <button className={styles.tool} aria-disabled={loadedImage?.id !== item.id} aria-pressed={zoomed} onClick={() => { if (loadedImage?.id === item.id) setZoomedId(zoomed ? null : item.id); }} aria-label={zoomed ? "화면에 맞춤" : "이미지 확대"}>
            <IconZoom /><span>{zoomed ? "화면에 맞춤" : "확대"}</span>
          </button>
          <a className={styles.tool} href={item.image.fullSrc} target="_blank" rel="noopener noreferrer" aria-label="원본 이미지 새 탭에서 보기"><span>원본</span><span aria-hidden="true">↗</span></a>
          <span className={styles.divider} aria-hidden="true" />
          <button ref={closeButtonRef} className={styles.iconButton} onClick={onClose} aria-label="상세 보기 닫기"><IconClose /></button>
        </div>
      </header>

      <div className={styles.content}>
        <div className={styles.stage} style={{ "--image-ratio": ratio } as CSSProperties}>
          <GalleryArtwork key={item.id} item={item} zoomed={zoomed} onToggleZoom={() => setZoomedId(zoomed ? null : item.id)} onReady={(ratio) => setLoadedImage({ id: item.id, ratio })} />
          <span className={styles.stage__hint}>{zoomed ? "스크롤하거나 드래그해 둘러보세요 · 누르면 화면에 맞춤" : "이미지를 누르면 확대됩니다"}</span>
        </div>
        <aside className={styles.info}>
          <p className={styles.eyebrow}>{item.kind === "SESSION" ? "SESSION ARCHIVE" : "FAN ART"}</p>
          <h2 id={titleId}>{item.title}</h2>
          {item.kind === "FANART" && <p className={styles.artist}><span>ARTIST</span>{item.artistName}</p>}
          {description && description !== item.title.trim() && <p className={styles.description}>{description}</p>}
          {album && <Link href={album.href} className={styles.album}>
            <span className={styles.album__label}>이 장면의 이야기 <span aria-hidden="true">↗</span></span>
            <strong>{album.title}</strong>
            <span>{album.series === "mini" ? "미니 세션" : "메인 세션"} · REPORT {album.reportNumber}</span>
          </Link>}
          {item.tags.length > 0 && <ul className={styles.tags} aria-label="태그">{item.tags.map((tag) => <li key={tag}>#{tag}</li>)}</ul>}
        </aside>
      </div>

      {hasNavigation && <footer className={styles.filmstrip}>
        <span className={styles.filmstrip__hint}><kbd>←</kbd><kbd>→</kbd> 이미지 이동</span>
        <div className={styles.thumbnails} role="group" aria-label="주변 이미지">
          {thumbnails.map((entry, offset) => <button
            key={entry.id}
            aria-label={`${firstThumbnail + offset + 1}번째 이미지: ${entry.title}`}
            aria-current={entry.id === item.id ? "true" : undefined}
            onClick={() => { setZoomedId(null); onSelect(entry.id); }}
          ><Image src={entry.image.src} alt="" fill sizes="64px" unoptimized={entry.kind === "FANART"} /></button>)}
        </div>
        <span className={styles.filmstrip__hint}><kbd>ESC</kbd> 닫기</span>
      </footer>}
    </div>
  </dialog>;
}

/** 이미지와 로딩 상태를 같은 key 아래 교체해 이전 그림에 새 제목이 붙지 않게 한다. */
function GalleryArtwork({ item, zoomed, onToggleZoom, onReady }: {
  item: GalleryItemDto;
  zoomed: boolean;
  onToggleZoom: () => void;
  onReady: (ratio: number) => void;
}) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);

  useEffect(() => {
    if (status !== "loading") return;
    const timeout = window.setTimeout(() => setStatus("error"), 15_000);
    return () => window.clearTimeout(timeout);
  }, [attempt, status]);

  return <div className={`${styles.artwork} ${zoomed ? styles["artwork--zoomed"] : ""}`} ref={viewportRef}
    tabIndex={zoomed ? 0 : -1} aria-label={zoomed ? "확대 이미지, 스크롤로 이동" : undefined}
    onPointerDown={(event) => {
      if (!zoomed || event.pointerType !== "mouse" || event.button !== 0) return;
      const viewport = event.currentTarget;
      dragRef.current = { x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop, moved: false };
      viewport.setPointerCapture(event.pointerId);
    }}
    onPointerMove={(event) => {
      const drag = dragRef.current;
      if (!drag) return;
      const x = event.clientX - drag.x;
      const y = event.clientY - drag.y;
      if (Math.abs(x) + Math.abs(y) > 5) drag.moved = true;
      event.currentTarget.scrollLeft = drag.left - x;
      event.currentTarget.scrollTop = drag.top - y;
    }}
    onPointerUp={(event) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }}
    onPointerCancel={() => { dragRef.current = null; }}
    onClick={() => {
      const dragged = dragRef.current?.moved;
      dragRef.current = null;
      if (status === "ready" && !dragged) onToggleZoom();
    }}
  >
    <div className={styles.artwork__canvas}>
      <Image key={attempt} src={item.image.fullSrc} alt={item.image.alt}
        width={item.image.width ?? 1600} height={item.image.height ?? 1200}
        unoptimized priority draggable={false} className={status === "ready" ? styles.artwork__image : styles.artwork__pending}
        onLoad={(event) => { setStatus("ready"); onReady(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight); }} onError={() => setStatus("error")} />
    </div>
    {status !== "ready" && <div className={styles.feedback} role="status">
      {status === "loading" ? <><span className={styles.spinner} aria-hidden="true" /><p>이미지를 불러오는 중입니다</p></> : <>
        <IconZoom aria-hidden="true" /><strong>이미지를 불러오지 못했어요.</strong><p>잠시 후 다시 시도하거나 원본을 열어보세요.</p>
        <button onClick={(event) => { event.stopPropagation(); setStatus("loading"); setAttempt((value) => value + 1); }}>다시 불러오기</button>
      </>}
    </div>}
  </div>;
}
