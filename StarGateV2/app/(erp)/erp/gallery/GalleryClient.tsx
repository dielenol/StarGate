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
import type { ReactNode } from "react";

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
import Input from "@/components/ui/Input/Input";
import Tag from "@/components/ui/Tag/Tag";

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
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    requestAnimationFrame(() => getFocusable()[0]?.focus());
    return () => {
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
  const currentExhibit = items[0] ?? null;
  const supportingExhibits = items.slice(1, 3);
  const archiveItems = items.slice(3);

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
      <Box className={styles.toolbar}>
        <div className={styles.toolbar__heading}><span>ARCHIVE // VISUAL LOG</span><strong>세션 앨범과 팬아트</strong></div>
        <div className={styles.toolbar__actions}>
          <span className={styles.toolbar__count}>{items.length} / {data.items.length} ITEMS</span>
          <Button variant="primary" onClick={() => setEditorMode("upload")} disabled={!data.viewer.canUpload || !data.storage.uploadEnabled} title={!data.storage.uploadEnabled ? "업로드 스토리지가 아직 준비되지 않았습니다." : undefined}>+ 팬아트 등록</Button>
        </div>
        {!data.storage.uploadEnabled && <p className={styles.toolbar__notice}>이미지 스토리지가 준비 중이라 현재 팬아트 등록은 비활성화되어 있습니다.</p>}
        <div className={styles.filters}>
          <Input aria-label="갤러리 검색" placeholder="제목, 설명, 작가, 태그, 앨범 검색" value={query} onChange={(event) => setQuery(event.target.value)} />
          <select aria-label="종류 필터" value={kind} onChange={(event) => setKind(event.target.value as FilterKind)}><option value="ALL">전체 종류</option><option value="SESSION">세션 앨범</option><option value="FANART">팬아트</option></select>
          <select aria-label="앨범 필터" value={album} onChange={(event) => setAlbum(event.target.value)}><option value="">전체 앨범</option>{data.albums.map((entry) => <option key={entry.sessionId} value={entry.sessionId}>{entry.reportNumber} · {entry.title}</option>)}</select>
        </div>
      </Box>

      {isError && <Box className={styles.state}><strong>최신 갤러리 정보를 가져오지 못했습니다.</strong><p>{mutationMessage(error)}</p><Button onClick={() => void refetch()}>다시 시도</Button></Box>}
      {isLoading && !data.items.length && <Box className={styles.state} aria-live="polite">갤러리 기록을 불러오는 중입니다.</Box>}
      {!isLoading && !items.length && <Box className={styles.state}><strong>표시할 이미지가 없습니다.</strong><p>{query || kind !== "ALL" || album ? "필터를 초기화하면 더 많은 기록을 볼 수 있습니다." : "세션 보고서에 이미지가 추가되거나 첫 팬아트가 등록되면 이곳에 표시됩니다."}</p></Box>}
      {currentExhibit && <div className={`${styles.showcase} ${supportingExhibits.length ? "" : styles["showcase--solo"]}`} aria-busy={query !== deferredQuery}>
        <div className={styles.showcase__current}>
          <span className={styles.showcase__label}>CURRENT EXHIBIT</span>
          <GalleryCard key={currentExhibit.id} item={currentExhibit} variant="current" album={currentExhibit.albumSessionId ? albumBySessionId.get(currentExhibit.albumSessionId) ?? null : null} deleteError={deleteError?.id === currentExhibit.id ? deleteError.message : ""} eager isDeleting={deletingId === currentExhibit.id} onOpen={() => setSelectedId(currentExhibit.id)} onEdit={() => { setEditing(currentExhibit as GalleryFanartItemDto); setEditorMode("edit"); }} onModerate={() => { setEditing(currentExhibit as GalleryFanartItemDto); setEditorMode("moderate"); }} onDelete={() => { if (currentExhibit.kind === "FANART") void deleteFanart(currentExhibit); }} />
        </div>
        {supportingExhibits.length > 0 && <div className={styles.showcase__support}>{supportingExhibits.map((item) => <GalleryCard key={item.id} item={item} variant="support" album={item.albumSessionId ? albumBySessionId.get(item.albumSessionId) ?? null : null} deleteError={deleteError?.id === item.id ? deleteError.message : ""} eager={false} isDeleting={deletingId === item.id} onOpen={() => setSelectedId(item.id)} onEdit={() => { setEditing(item as GalleryFanartItemDto); setEditorMode("edit"); }} onModerate={() => { setEditing(item as GalleryFanartItemDto); setEditorMode("moderate"); }} onDelete={() => { if (item.kind === "FANART") void deleteFanart(item); }} />)}</div>}
      </div>}
      {archiveItems.length > 0 && <div className={styles.grid} aria-busy={query !== deferredQuery}>{archiveItems.map((item) => <GalleryCard key={item.id} item={item} variant="grid" album={item.albumSessionId ? albumBySessionId.get(item.albumSessionId) ?? null : null} deleteError={deleteError?.id === item.id ? deleteError.message : ""} eager={false} isDeleting={deletingId === item.id} onOpen={() => setSelectedId(item.id)} onEdit={() => { setEditing(item as GalleryFanartItemDto); setEditorMode("edit"); }} onModerate={() => { setEditing(item as GalleryFanartItemDto); setEditorMode("moderate"); }} onDelete={() => { if (item.kind === "FANART") void deleteFanart(item); }} />)}</div>}

      {selected && <Lightbox item={selected} album={selected.albumSessionId ? albumBySessionId.get(selected.albumSessionId) ?? null : null} index={selectedIndex} total={items.length} onClose={() => setSelectedId(null)} onPrevious={() => setSelectedId(items[(selectedIndex - 1 + items.length) % items.length]?.id ?? null)} onNext={() => setSelectedId(items[(selectedIndex + 1) % items.length]?.id ?? null)} />}
      {editorMode === "upload" && <FanartEditor albums={data.albums} onClose={() => setEditorMode(null)} />}
      {editorMode === "edit" && editing && <FanartEditor item={editing} albums={data.albums} onClose={() => { setEditing(null); setEditorMode(null); }} />}
      {editorMode === "moderate" && editing && <ModerationEditor item={editing} onClose={() => { setEditing(null); setEditorMode(null); }} />}
    </section>
  );
}

function GalleryCard({ item, variant, album, deleteError, eager, isDeleting, onOpen, onEdit, onModerate, onDelete }: { item: GalleryItemDto; variant: "current" | "support" | "grid"; album: GalleryAlbumDto | null; deleteError: string; eager: boolean; isDeleting: boolean; onOpen: () => void; onEdit: () => void; onModerate: () => void; onDelete: () => void }) {
  const fanart = item.kind === "FANART" ? item : null;
  const imageSizes = variant === "current" ? "(max-width: 680px) 100vw, (max-width: 1100px) 66vw, 58vw" : variant === "support" ? "(max-width: 680px) 100vw, (max-width: 1100px) 33vw, 28vw" : "(max-width: 680px) 100vw, (max-width: 1100px) 50vw, (max-width: 1500px) 25vw, 300px";
  return <article className={`${styles.card} ${styles[`card--${variant}`]}`}><button className={styles.card__imageButton} onClick={onOpen} aria-label={`${item.title} 크게 보기`}><Image src={item.image.src} alt={item.image.alt} fill loading={eager ? "eager" : "lazy"} sizes={imageSizes} unoptimized={item.kind === "FANART"} className={styles.card__image} /><span className={styles.card__scanline} aria-hidden="true" /><span className={styles.card__kind}>{item.kind === "SESSION" ? "SESSION" : "FAN ART"}</span>{fanart?.status === "HIDDEN" && <span className={styles.card__hidden}>숨김</span>}</button><div className={styles.card__body}><div className={styles.card__titleRow}><h2>{item.title}</h2>{album && <Link href={album.href} className={styles.card__album}>{album.reportNumber}</Link>}</div>{fanart && <p className={styles.card__artist}>ARTIST · {fanart.artistName}</p>}<p className={styles.card__description}>{item.description || "설명 없음"}</p>{deleteError && <p className={styles.form__error} role="alert">{deleteError}</p>}<div className={styles.card__footer}>{item.tags.slice(0, 3).map((tag) => <Tag key={tag}>{tag}</Tag>)}{fanart && (fanart.canEdit || fanart.canModerate || fanart.canDelete) && <span className={styles.card__actions}>{fanart.canEdit && <button onClick={onEdit}>편집</button>}{fanart.canModerate && <button onClick={onModerate}>관리</button>}{fanart.canDelete && <button onClick={onDelete} disabled={isDeleting}>{isDeleting ? "삭제 중…" : "삭제"}</button>}</span>}</div></div></article>;
}

function Lightbox({ item, album, index, total, onClose, onPrevious, onNext }: { item: GalleryItemDto; album: GalleryAlbumDto | null; index: number; total: number; onClose: () => void; onPrevious: () => void; onNext: () => void }) {
  const titleId = useId();
  const extraKeys = (event: KeyboardEvent) => { if (event.key === "ArrowLeft") { event.preventDefault(); onPrevious(); return true; } if (event.key === "ArrowRight") { event.preventDefault(); onNext(); return true; } return false; };
  const dialogRef = useDialogA11y(true, onClose, false, extraKeys);
  const archiveLabel = item.kind === "SESSION" ? "세션 아카이브" : "팬아트 아카이브";
  const description = item.description.trim();
  const hasDistinctDescription = description.length > 0 && description !== item.title.trim();
  return <div className={styles.overlay} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className={styles.lightbox} ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId}><button className={styles.modal__close} onClick={onClose} aria-label="상세 보기 닫기">×</button><div className={styles.lightbox__stage}>{total > 1 && <button className={`${styles.lightbox__edge} ${styles["lightbox__edge--previous"]}`} onClick={onPrevious} aria-label="이전 이미지">‹</button>}<div className={styles.lightbox__image}><Image src={item.image.fullSrc} alt={item.image.alt} width={item.image.width ?? 1600} height={item.image.height ?? 1200} sizes="(max-width: 920px) 100vw, 72vw" unoptimized={item.kind === "FANART"} priority /></div>{total > 1 && <button className={`${styles.lightbox__edge} ${styles["lightbox__edge--next"]}`} onClick={onNext} aria-label="다음 이미지">›</button>}<span className={styles.lightbox__counter}>{String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}</span></div><div className={styles.lightbox__meta}><p className={styles.lightbox__eyebrow}>{archiveLabel}{album && <> <span aria-hidden="true">·</span> {album.reportNumber}</>}</p><h2 id={titleId}>{item.title}</h2>{hasDistinctDescription && <p className={styles.lightbox__description}>{description}</p>}{item.kind === "FANART" && <p className={styles.lightbox__artist}>작가 {item.artistName}</p>}{album && <Link href={album.href} className={styles.lightbox__album}>작전 보고서 보기 <span aria-hidden="true">↗</span></Link>}<p className={styles.lightbox__tags} aria-label={`태그: ${item.tags.join(", ")}`}>{item.tags.slice(0, 6).map((tag, tagIndex) => <span key={tag}>{tagIndex > 0 && <span aria-hidden="true"> · </span>}{tag}</span>)}{item.tags.length > 6 && <span> · +{item.tags.length - 6}</span>}</p></div></div></div>;
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
  return <div className={styles.overlay} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) onClose(); }}><div className={styles.dialog} ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId}><button className={styles.modal__close} onClick={onClose} disabled={pending} aria-label="닫기">×</button><h2 id={titleId}>{isEdit ? "팬아트 정보 수정" : "팬아트 등록"}</h2><p className={styles.dialog__hint}>{isEdit ? "이미지는 교체할 수 없습니다." : "PNG, JPEG, WebP 원본 20MB 이하 · 업로드 전 4MB 이하 WebP로 최적화됩니다."}</p><form onSubmit={(event) => void submit(event)} className={styles.form}>{!isEdit && <Field label="이미지"><Input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void chooseFile(event.target.files?.[0] ?? null)} disabled={pending} />{preview && <Image src={preview} alt="업로드 미리보기" width={320} height={240} unoptimized className={styles.form__preview} />}</Field>}<Field label="제목"><Input value={metadata.title} maxLength={80} onChange={(event) => change("title", event.target.value)} disabled={pending} /></Field><Field label="작가명"><Input value={metadata.artistName} maxLength={40} onChange={(event) => change("artistName", event.target.value)} disabled={pending} /></Field><Field label="대체 텍스트"><Input value={metadata.altText} maxLength={160} onChange={(event) => change("altText", event.target.value)} disabled={pending} /></Field><Field label="설명"><textarea value={metadata.description} maxLength={500} onChange={(event) => change("description", event.target.value)} disabled={pending} /></Field><Field label="태그 (쉼표로 구분, 최대 8개)"><Input value={metadata.tags} onChange={(event) => change("tags", event.target.value)} disabled={pending} /></Field><Field label="관련 세션 앨범"><select value={metadata.sessionId} onChange={(event) => change("sessionId", event.target.value)} disabled={pending}><option value="">연결하지 않음</option>{albums.map((album) => <option value={album.sessionId} key={album.sessionId}>{album.reportNumber} · {album.title}</option>)}</select></Field><label className={styles.check}><input type="checkbox" checked={metadata.rightsConfirmed} onChange={(event) => change("rightsConfirmed", event.target.checked)} disabled={pending} />본인이 게시할 권한이 있는 이미지입니다.</label>{error && <p className={styles.form__error} role="alert">{error}</p>}<div className={styles.form__actions}><Button onClick={onClose} disabled={pending}>취소</Button><Button variant="primary" type="submit" disabled={pending}>{pending ? "처리 중…" : isEdit ? "저장" : "등록"}</Button></div></form></div></div>;
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
