"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useEffect,
  useDeferredValue,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CSSProperties, ReactNode, RefCallback } from "react";

import {
  useDeleteGalleryFanart,
  useModerateGalleryFanart,
  useUpdateGalleryFanart,
  useUploadGalleryFanart,
} from "@/hooks/mutations/useGalleryMutation";
import { useGallery } from "@/hooks/queries/useGalleryQuery";
import type {
  GalleryAlbumDto,
  GalleryFanartItemDto,
  GalleryFanartMetadataInput,
  GalleryFeedResponse,
  GalleryItemDto,
} from "@/types/gallery";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import DropdownSelect from "@/components/ui/DropdownSelect/DropdownSelect";
import type { DropdownSelectOption } from "@/components/ui/DropdownSelect/DropdownSelect";
import Input from "@/components/ui/Input/Input";
import Select from "@/components/ui/Select/Select";
import { IconClose, IconSearch, IconZoom } from "@/components/icons";

import GalleryViewer from "./GalleryViewer";

import { prepareGalleryImage } from "./gallery-image";
import styles from "./page.module.css";

type FilterKind = "ALL" | GalleryItemDto["kind"];
type EditorMode = "upload" | "edit" | "moderate" | null;

interface Props {
  initialData: GalleryFeedResponse;
  initialDataUpdatedAt: number;
}

interface MetadataState {
  title: string;
  description: string;
  artistName: string;
  altText: string;
  tags: string;
  sessionId: string;
  rightsConfirmed: boolean;
}

const EMPTY_METADATA: MetadataState = {
  title: "",
  description: "",
  artistName: "",
  altText: "",
  tags: "",
  sessionId: "",
  rightsConfirmed: false,
};

const KIND_OPTIONS: readonly DropdownSelectOption<FilterKind>[] = [
  { value: "ALL", label: "전체" },
  { value: "SESSION", label: "세션 앨범" },
  { value: "FANART", label: "팬아트" },
];
const PAGE_SIZE = 48;
// CSS grid-auto-rows / 카드 하단 간격과 같은 값.
const GRID_ROW = 4;
const GRID_GAP = 24;

function imageRatio(image: { width: number | null; height: number | null }): number | null {
  return image.width && image.height ? image.width / image.height : null;
}

/**
 * 아카이브 그리드는 세로 도판이 섞여 카드 높이가 크게 달라진다. 카드마다 실제 높이만큼
 * grid row 를 점유하게 해(masonry) 행 단위로 생기던 빈 공간을 없앤다.
 * 카드 높이는 `align-self: start` 라 점유 행 수와 무관하므로 되먹임이 생기지 않는다.
 */
function useMasonrySpan(
  enabled: boolean,
): [RefCallback<HTMLElement>, number | null] {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [span, setSpan] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled || !node) return;
    const observer = new ResizeObserver(() => {
      const height = node.getBoundingClientRect().height;
      if (height > 0) setSpan(Math.ceil((height + GRID_GAP) / GRID_ROW));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, node]);

  return [setNode, span];
}

function toMetadata(input: MetadataState): GalleryFanartMetadataInput {
  return {
    title: input.title.trim(),
    description: input.description.trim(),
    artistName: input.artistName.trim(),
    altText: input.altText.trim(),
    tags: input.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    sessionId: input.sessionId || null,
    rightsConfirmed: true,
  };
}

function fanartMetadata(item: GalleryFanartItemDto): MetadataState {
  return {
    title: item.title,
    description: item.description,
    artistName: item.artistName,
    altText: item.image.alt,
    tags: item.tags.join(", "),
    sessionId: item.albumSessionId ?? "",
    rightsConfirmed: true,
  };
}

function mutationMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

function useDialogA11y(
  isOpen: boolean,
  onClose: () => void,
  pending = false,
  extraKeys?: (event: KeyboardEvent) => boolean,
) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const pendingRef = useRef(pending);
  const extraKeysRef = useRef(extraKeys);

  useEffect(() => {
    onCloseRef.current = onClose;
    pendingRef.current = pending;
    extraKeysRef.current = extraKeys;
  }, [extraKeys, onClose, pending]);

  useEffect(() => {
    if (!isOpen) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const getFocusable = () =>
      Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    const keydown = (event: KeyboardEvent) => {
      if (extraKeysRef.current?.(event)) return;
      if (event.key === "Escape" && !pendingRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = getFocusable();
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1)!;
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey && (active === first || !dialogRef.current?.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialogRef.current?.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    const frame = requestAnimationFrame(() => getFocusable()[0]?.focus());
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", keydown);
      previousFocusRef.current?.focus();
    };
  }, [isOpen]);

  return dialogRef;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className={styles.field}><span className={styles.field__label}>{label}</span>{children}</label>;
}

export default function GalleryClient({ initialData, initialDataUpdatedAt }: Props) {
  const { data = initialData, isLoading, isError, error, refetch } = useGallery({
    initialData,
    initialDataUpdatedAt,
  });
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<FilterKind>("ALL");
  const [album, setAlbum] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const gridRef = useRef<HTMLDivElement>(null);
  const previousVisibleCount = useRef(PAGE_SIZE);
  const [editorMode, setEditorMode] = useState<EditorMode>(null);
  const [editing, setEditing] = useState<GalleryFanartItemDto | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<{ id: string; message: string } | null>(null);
  const removeGalleryFanart = useDeleteGalleryFanart();
  const deferredQuery = useDeferredValue(query);
  const albumBySessionId = useMemo(
    () => new Map(data.albums.map((entry) => [entry.sessionId, entry])),
    [data.albums],
  );
  const albumOptions = useMemo<readonly DropdownSelectOption<string>[]>(
    () => [
      { value: "", label: "전체 앨범" },
      ...data.albums.map((entry) => ({
        value: entry.sessionId,
        label: `${entry.reportNumber} · ${entry.title}`,
      })),
    ],
    [data.albums],
  );

  const items = useMemo(() => {
    const needle = deferredQuery.trim().toLocaleLowerCase("ko-KR");
    return data.items.filter((item) => {
      if (kind !== "ALL" && item.kind !== kind) return false;
      if (album && item.albumSessionId !== album) return false;
      if (!needle) return true;
      const fields = [item.title, item.description, item.tags.join(" "), item.albumSessionId ? albumBySessionId.get(item.albumSessionId)?.title ?? "" : ""];
      if (item.kind === "FANART") fields.push(item.artistName, item.authorName);
      return fields.join(" ").toLocaleLowerCase("ko-KR").includes(needle);
    });
  }, [album, albumBySessionId, data.items, deferredQuery, kind]);
  const selectedIndex = items.findIndex((item) => item.id === selectedId);
  const selected = selectedIndex >= 0 ? items[selectedIndex] : null;
  useEffect(() => {
    const previous = previousVisibleCount.current;
    previousVisibleCount.current = visibleCount;
    if (visibleCount > previous) {
      gridRef.current?.children[previous]?.querySelector<HTMLButtonElement>("button")?.focus();
    }
  }, [visibleCount]);

  const hasFilters = Boolean(query || kind !== "ALL" || album);
  const resetFilters = () => {
    setQuery("");
    setKind("ALL");
    setAlbum("");
    setVisibleCount(PAGE_SIZE);
  };

  async function deleteFanart(item: GalleryFanartItemDto) {
    if (!window.confirm("이 팬아트를 삭제할까요? 이미지도 삭제되며 되돌릴 수 없습니다.")) return;
    setDeleteError(null);
    setDeletingId(item.id);
    try {
      await removeGalleryFanart.mutateAsync({
        id: item.id,
        expectedUpdatedAt: item.updatedAt,
      });
    } catch (error) {
      setDeleteError({ id: item.id, message: mutationMessage(error) });
    } finally {
      setDeletingId(null);
    }
  }

  if (data.viewer.isGuest) {
    return <Box className={styles.memberOnly}><div className={styles.memberOnly__eyebrow}>MEMBER ACCESS</div><h2>회원 전용 갤러리</h2><p>세션 기록과 팬아트는 등록된 에이전트에게만 공개됩니다.</p></Box>;
  }

  return (
    <section className={styles.gallery} aria-label="갤러리">
      <header className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>NOVUS ORDO / VISUAL ARCHIVE</p>
          <h1>갤러리<span className={styles.heading__count}>{data.items.length}</span></h1>
          <p className={styles.heading__description}>우리가 지나온 장면, 함께 그려낸 이야기.</p>
        </div>
        {data.viewer.canUpload && <div className={styles.heading__actions}>
          <Button variant="primary" onClick={() => setEditorMode("upload")} disabled={!data.storage.uploadEnabled}>{data.storage.uploadEnabled ? "+ 팬아트 등록" : "팬아트 등록 준비 중"}</Button>
        </div>}
      </header>

      <div className={styles.toolbar}>
        <div className={styles.kinds} role="group" aria-label="종류 필터">
          {KIND_OPTIONS.map((option) => <button
            key={option.value}
            aria-pressed={kind === option.value}
            onClick={() => { setKind(option.value); setVisibleCount(PAGE_SIZE); }}
          >{option.label}</button>)}
        </div>
        <div className={styles.filters}>
          <div className={styles.search}>
            <IconSearch aria-hidden="true" />
            <Input aria-label="갤러리 검색" placeholder="제목, 작가, 태그 검색" value={query} onChange={(event) => { setQuery(event.target.value); setVisibleCount(PAGE_SIZE); }} />
            {query && <button onClick={() => { setQuery(""); setVisibleCount(PAGE_SIZE); }} aria-label="검색어 지우기"><IconClose /></button>}
          </div>
          <DropdownSelect ariaLabel="앨범 필터" className={styles.filters__album} value={album} onChange={(value) => { setAlbum(value); setVisibleCount(PAGE_SIZE); }} options={albumOptions} />
        </div>
      </div>
      <div className={styles.results}>
        <p role="status">{hasFilters ? "검색 결과" : "전체 기록"} <strong>{items.length}</strong><span>개의 이미지</span></p>
        {hasFilters ? <button onClick={resetFilters}>필터 초기화 <IconClose aria-hidden="true" /></button> : <span className={styles.results__hint}>이미지를 선택해 자세히 감상하세요</span>}
      </div>

      {isError && <Box className={styles.state}><strong>최신 갤러리 정보를 가져오지 못했습니다.</strong><p>{mutationMessage(error)}</p><Button onClick={() => void refetch()}>다시 시도</Button></Box>}
      {isLoading && !data.items.length && <Box className={styles.state} aria-live="polite">갤러리 기록을 불러오는 중입니다.</Box>}
      {!isLoading && !items.length && <div className={styles.state}>
        <IconSearch className={styles.state__icon} aria-hidden="true" />
        <strong>{hasFilters ? "이 조건에 맞는 이미지가 없어요." : "아직 등록된 이미지가 없습니다."}</strong>
        <p>{hasFilters ? "다른 검색어를 입력하거나 필터를 해제해 보세요." : "세션의 한 장면과 여러분의 팬아트가 이곳에 모입니다."}</p>
        {hasFilters && <Button onClick={resetFilters}>전체 이미지 보기</Button>}
      </div>}
      <div ref={gridRef} className={styles.grid} aria-busy={query !== deferredQuery}>
        {items.slice(0, visibleCount).map((item, index) => <GalleryCard
          key={item.id}
          item={item}
          album={item.albumSessionId ? albumBySessionId.get(item.albumSessionId) ?? null : null}
          deleteError={deleteError?.id === item.id ? deleteError.message : ""}
          eager={index < 3}
          isDeleting={deletingId === item.id}
          onOpen={() => setSelectedId(item.id)}
          onEdit={() => { if (item.kind === "FANART") { setEditing(item); setEditorMode("edit"); } }}
          onModerate={() => { if (item.kind === "FANART") { setEditing(item); setEditorMode("moderate"); } }}
          onDelete={() => { if (item.kind === "FANART") void deleteFanart(item); }}
        />)}
      </div>
      {items.length > PAGE_SIZE && <div className={styles.more}>
        <span>{Math.min(visibleCount, items.length)} / {items.length}</span>
        {visibleCount < items.length && <Button onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>이미지 더 보기 <span aria-hidden="true">↓</span></Button>}
      </div>}

      {selected && <GalleryViewer
        items={items}
        item={selected}
        album={selected.albumSessionId ? albumBySessionId.get(selected.albumSessionId) ?? null : null}
        index={selectedIndex}
        onClose={() => setSelectedId(null)}
        onSelect={setSelectedId}
      />}
      {editorMode === "upload" && <FanartEditor albums={data.albums} onClose={() => setEditorMode(null)} />}
      {editorMode === "edit" && editing && <FanartEditor item={editing} albums={data.albums} onClose={() => { setEditing(null); setEditorMode(null); }} />}
      {editorMode === "moderate" && editing && <ModerationEditor item={editing} onClose={() => { setEditing(null); setEditorMode(null); }} />}
    </section>
  );
}

function GalleryCard({ item, album, deleteError, eager, isDeleting, onOpen, onEdit, onModerate, onDelete }: {
  item: GalleryItemDto;
  album: GalleryAlbumDto | null;
  deleteError: string;
  eager: boolean;
  isDeleting: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onModerate: () => void;
  onDelete: () => void;
}) {
  const fanart = item.kind === "FANART" ? item : null;
  const [naturalRatio, setNaturalRatio] = useState<number | null>(() => imageRatio(item.image));
  const [imageFailed, setImageFailed] = useState(false);
  const [masonryRef, masonrySpan] = useMasonrySpan(true);
  const frameStyle = {
    "--card-ratio": String(Math.min(2.4, Math.max(0.75, naturalRatio ?? 1.5))),
    ...(masonrySpan ? { "--card-span": String(masonrySpan) } : {}),
  } as CSSProperties;
  return <article ref={masonryRef} className={styles.card} style={frameStyle}>
    <button className={styles.card__imageButton} onClick={onOpen} aria-label={`${item.title} 크게 보기`}>
      <Image src={item.image.src} alt={item.image.alt} fill loading={eager ? "eager" : "lazy"}
        sizes="(max-width: 600px) 100vw, (max-width: 1100px) 50vw, 33vw"
        unoptimized={item.kind === "FANART"} className={styles.card__image}
        onError={() => setImageFailed(true)}
        onLoad={(event) => {
          setImageFailed(false);
          const { naturalWidth, naturalHeight } = event.currentTarget;
          if (naturalWidth > 0 && naturalHeight > 0) setNaturalRatio(naturalWidth / naturalHeight);
        }}
      />
      {imageFailed && <span className={styles.card__fallback}>미리보기를 불러오지 못했어요.<br />눌러서 원본 보기</span>}
      <span className={styles.card__zoom} aria-hidden="true"><IconZoom /></span>
      {fanart?.status === "HIDDEN" && <span className={styles.card__hidden}>숨김</span>}
    </button>
    <div className={styles.card__body}>
      <div className={styles.card__meta}>
        <span>{item.kind === "SESSION" ? "세션 앨범" : "팬아트"}</span>
        {album && <Link href={album.href}>{album.series === "mini" ? "미니" : "메인"} {album.reportNumber} <span aria-hidden="true">↗</span></Link>}
      </div>
      <h2><button onClick={onOpen}>{item.title}</button></h2>
      {fanart && <p className={styles.card__artist}>{fanart.artistName}</p>}
      {deleteError && <p className={styles.form__error} role="alert">{deleteError}</p>}
      {fanart && (fanart.canEdit || fanart.canModerate || fanart.canDelete) && <div className={styles.card__actions}>
        {fanart.canEdit && <button onClick={onEdit}>편집</button>}
        {fanart.canModerate && <button onClick={onModerate}>관리</button>}
        {fanart.canDelete && <button onClick={onDelete} disabled={isDeleting}>{isDeleting ? "삭제 중…" : "삭제"}</button>}
      </div>}
    </div>
  </article>;
}

function FanartEditor({ item, albums, onClose }: { item?: GalleryFanartItemDto; albums: GalleryAlbumDto[]; onClose: () => void }) {
  const isEdit = Boolean(item);
  const [metadata, setMetadata] = useState<MetadataState>(item ? fanartMetadata(item) : EMPTY_METADATA);
  const [source, setSource] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const requestIdRef = useRef<string | null>(null);
  const upload = useUploadGalleryFanart();
  const update = useUpdateGalleryFanart();
  const pending = upload.isPending || update.isPending;
  const titleId = useId();
  const dialogRef = useDialogA11y(true, onClose, pending);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const change = (key: keyof MetadataState, value: string | boolean) => { setMetadata((current) => ({ ...current, [key]: value })); setError(""); requestIdRef.current = null; };
  async function chooseFile(file: File | null) { if (!file) return; setError(""); setSource(null); setPreview((current) => { if (current) URL.revokeObjectURL(current); return ""; }); requestIdRef.current = null; try { const prepared = await prepareGalleryImage(file); setSource(prepared); setPreview(URL.createObjectURL(prepared)); } catch (reason) { setError(mutationMessage(reason)); } }
  async function submit(event: React.FormEvent) { event.preventDefault(); const payload = toMetadata(metadata); if (!payload.title || !payload.artistName || !payload.altText || !metadata.rightsConfirmed) { setError("제목, 작가명, 대체 텍스트와 게시 권한 확인은 필수입니다."); return; } if (payload.tags.length > 8) { setError("태그는 최대 8개까지 입력할 수 있습니다."); return; } if (payload.tags.some((tag) => tag.length > 20)) { setError("태그는 각각 20자 이하로 입력해 주세요."); return; } if (new Set(payload.tags.map((tag) => tag.toLocaleLowerCase("ko-KR"))).size !== payload.tags.length) { setError("같은 태그를 중복해서 입력할 수 없습니다."); return; } try { if (isEdit && item) { await update.mutateAsync({ id: item.id, metadata: payload, expectedUpdatedAt: item.updatedAt }); } else if (source) { requestIdRef.current ??= `gallery-upload:${crypto.randomUUID()}`; await upload.mutateAsync({ file: source, metadata: payload, requestId: requestIdRef.current }); } else { setError("업로드할 이미지를 선택해 주세요."); return; } onClose(); } catch (reason) { setError(mutationMessage(reason)); } }
  return <div className={styles.overlay} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) onClose(); }}><div className={styles.dialog} ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId}><button className={styles.modal__close} onClick={onClose} disabled={pending} aria-label="닫기">×</button><h2 id={titleId}>{isEdit ? "팬아트 정보 수정" : "팬아트 등록"}</h2><p className={styles.dialog__hint}>{isEdit ? "이미지는 교체할 수 없습니다." : "PNG, JPEG, WebP 원본 20MB 이하 · 업로드 전 4MB 이하 WebP로 최적화됩니다."}</p><form onSubmit={(event) => void submit(event)} className={styles.form}>{!isEdit && <Field label="이미지"><Input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void chooseFile(event.target.files?.[0] ?? null)} disabled={pending} />{preview && <Image src={preview} alt="업로드 미리보기" width={320} height={240} unoptimized className={styles.form__preview} />}</Field>}<Field label="제목"><Input value={metadata.title} maxLength={80} onChange={(event) => change("title", event.target.value)} disabled={pending} /></Field><Field label="작가명"><Input value={metadata.artistName} maxLength={40} onChange={(event) => change("artistName", event.target.value)} disabled={pending} /></Field><Field label="대체 텍스트"><Input value={metadata.altText} maxLength={160} onChange={(event) => change("altText", event.target.value)} disabled={pending} /></Field><Field label="설명"><textarea value={metadata.description} maxLength={500} onChange={(event) => change("description", event.target.value)} disabled={pending} /></Field><Field label="태그 (쉼표로 구분, 최대 8개)"><Input value={metadata.tags} onChange={(event) => change("tags", event.target.value)} disabled={pending} /></Field><Field label="관련 세션 앨범"><Select value={metadata.sessionId} onChange={(event) => change("sessionId", event.target.value)} disabled={pending}><option value="">연결하지 않음</option>{albums.map((album) => <option value={album.sessionId} key={album.sessionId}>{album.reportNumber} · {album.title}</option>)}</Select></Field><label className={styles.check}><input type="checkbox" checked={metadata.rightsConfirmed} onChange={(event) => change("rightsConfirmed", event.target.checked)} disabled={pending} />본인이 게시할 권한이 있는 이미지입니다.</label>{error && <p className={styles.form__error} role="alert">{error}</p>}<div className={styles.form__actions}><Button onClick={onClose} disabled={pending}>취소</Button><Button variant="primary" type="submit" disabled={pending}>{pending ? "처리 중…" : isEdit ? "저장" : "등록"}</Button></div></form></div></div>;
}

function ModerationEditor({ item, onClose }: { item: GalleryFanartItemDto; onClose: () => void }) {
  const [reason, setReason] = useState(item.hiddenReason ?? "");
  const [error, setError] = useState("");
  const moderate = useModerateGalleryFanart();
  const remove = useDeleteGalleryFanart();
  const pending = moderate.isPending || remove.isPending;
  const titleId = useId();
  const dialogRef = useDialogA11y(true, onClose, pending);
  async function setStatus(status: "PUBLISHED" | "HIDDEN") { if (status === "HIDDEN" && !reason.trim()) { setError("숨김 사유를 입력해 주세요."); return; } try { await moderate.mutateAsync({ id: item.id, expectedUpdatedAt: item.updatedAt, status, reason: status === "HIDDEN" ? reason.trim() : "" }); onClose(); } catch (cause) { setError(mutationMessage(cause)); } }
  async function deleteItem() { if (!window.confirm("이 팬아트를 삭제할까요? 이미지도 삭제되며 되돌릴 수 없습니다.")) return; try { await remove.mutateAsync({ id: item.id, expectedUpdatedAt: item.updatedAt }); onClose(); } catch (cause) { setError(mutationMessage(cause)); } }
  return <div className={styles.overlay} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) onClose(); }}><div className={styles.dialog} ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId}><button className={styles.modal__close} onClick={onClose} disabled={pending} aria-label="닫기">×</button><h2 id={titleId}>팬아트 관리</h2><p className={styles.dialog__hint}>{item.title}</p><Field label="숨김 사유"><textarea value={reason} maxLength={160} onChange={(event) => setReason(event.target.value)} disabled={pending} placeholder="숨김 처리할 때만 필요합니다." /></Field>{error && <p className={styles.form__error} role="alert">{error}</p>}<div className={styles.form__actions}><Button onClick={onClose} disabled={pending}>취소</Button>{item.status === "HIDDEN" ? <Button variant="primary" onClick={() => void setStatus("PUBLISHED")} disabled={pending}>공개로 전환</Button> : <Button onClick={() => void setStatus("HIDDEN")} disabled={pending}>숨김</Button>}<Button onClick={() => void deleteItem()} disabled={pending}>삭제</Button></div></div></div>;
}
