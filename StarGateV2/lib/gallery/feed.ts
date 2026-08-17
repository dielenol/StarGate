import type {
  GalleryFanartDocument,
  GallerySessionReportDocument,
} from "@/lib/db/gallery";
import type {
  GalleryAlbumDto,
  GalleryFanartItemDto,
  GalleryFeedResponse,
  GallerySessionItemDto,
} from "@/types/gallery";
import { buildOperationReportNumbering } from "@/lib/format/session-report";
import { extractMarkdownImages } from "@/lib/markdown-images";

import { SESSION_CUTSCENES } from "./session-cutscenes";

const SESSION_ASSET_PREFIX = "/assets/session-reports/";

interface GalleryFeedBuildInput {
  reports: readonly GallerySessionReportDocument[];
  fanarts: readonly GalleryFanartDocument[];
  viewer: {
    id: string;
    isGuest: boolean;
    canModerate: boolean;
    canCleanupOrphans: boolean;
  };
  uploadEnabled: boolean;
  generatedAt: Date;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function reportId(report: GallerySessionReportDocument): string {
  return report._id?.toString() ?? "";
}

function buildAlbums(
  reports: readonly GallerySessionReportDocument[],
): GalleryAlbumDto[] {
  return buildOperationReportNumbering(reports)
    .map(({ report, number, series }) => {
      const id = reportId(report);
      if (!id) return null;
      return {
        sessionId: report.sessionId,
        series,
        reportNumber: number,
        title: report.sessionTitle,
        href: `/erp/sessions/report/${id}`,
      } satisfies GalleryAlbumDto;
    })
    .filter((album): album is GalleryAlbumDto => album !== null);
}

function buildSessionItems(
  reports: readonly GallerySessionReportDocument[],
  albumBySessionId: ReadonlyMap<string, GalleryAlbumDto>,
): GallerySessionItemDto[] {
  return reports.flatMap((report) => {
    const id = reportId(report);
    const album = albumBySessionId.get(report.sessionId);
    if (!id || !album) return [];
    const seriesTag = album.series === "mini" ? "미니" : "메인";
    const classificationTags = ["세션", seriesTag, album.reportNumber];

    const images = extractMarkdownImages(report.summary, {
      srcPrefix: SESSION_ASSET_PREFIX,
    });

    const documented = images.map((image, index) => {
      const title = image.caption || image.alt || report.sessionTitle;
      return {
        id: `session:${id}:${index}:${image.src}`,
        kind: "SESSION",
        title,
        description: image.caption || image.alt,
        image: {
          src: image.src,
          fullSrc: image.src,
          alt: image.alt || title,
          width: null,
          height: null,
        },
        albumSessionId: album.sessionId,
        tags: [...classificationTags],
        createdAt: toIsoString(report.createdAt),
      } satisfies GallerySessionItemDto;
    });

    const cutsceneAlbum = SESSION_CUTSCENES[report.sessionId] ?? null;
    const extra = (cutsceneAlbum?.shots ?? []).map((entry, index) => {
      const title = `${report.sessionTitle} 컷신 ${String(index + 1).padStart(2, "0")}`;
      const src = `${SESSION_ASSET_PREFIX}${cutsceneAlbum?.folder ?? ""}/${entry.file}`;
      return {
        id: `session:${id}:cutscene:${entry.file}`,
        kind: "SESSION",
        title,
        description: "",
        image: {
          src,
          fullSrc: src,
          alt: title,
          width: entry.width,
          height: entry.height,
        },
        albumSessionId: album.sessionId,
        tags: [...classificationTags, "컷신"],
        createdAt: toIsoString(report.createdAt),
      } satisfies GallerySessionItemDto;
    });

    return [...documented, ...extra];
  });
}

function buildFanartItems(
  fanarts: readonly GalleryFanartDocument[],
  albumBySessionId: ReadonlyMap<string, GalleryAlbumDto>,
  viewer: GalleryFeedBuildInput["viewer"],
): GalleryFanartItemDto[] {
  return fanarts.flatMap((fanart) => {
    const album = fanart.sessionId
      ? albumBySessionId.get(fanart.sessionId) ?? null
      : null;
    if (fanart.status === "DELETED") return [];

    const isOwner = fanart.authorId === viewer.id;
    const isOrphan = Boolean(fanart.sessionId && !album);
    if (isOrphan && !isOwner && !viewer.canCleanupOrphans) return [];
    const canModerate =
      viewer.canModerate && (!isOrphan || viewer.canCleanupOrphans);
    return [
      {
        id: fanart._id,
        kind: "FANART",
        title: fanart.title,
        description: fanart.description,
        image: {
          src: `/api/erp/gallery/image/${encodeURIComponent(fanart._id)}?variant=thumbnail`,
          fullSrc: `/api/erp/gallery/image/${encodeURIComponent(fanart._id)}?variant=original`,
          alt: fanart.altText || fanart.title,
          width: fanart.image.width,
          height: fanart.image.height,
        },
        albumSessionId: album?.sessionId ?? null,
        tags: fanart.tags,
        createdAt: fanart.createdAt.toISOString(),
        updatedAt: fanart.updatedAt.toISOString(),
        artistName: fanart.artistName,
        authorName: fanart.authorName,
        status: fanart.status,
        hiddenReason:
          isOwner || viewer.canModerate ? fanart.hiddenReason ?? null : null,
        canEdit: isOwner,
        canDelete: isOwner || canModerate,
        canModerate,
      } satisfies GalleryFanartItemDto,
    ];
  });
}

export function buildGalleryFeed(
  input: GalleryFeedBuildInput,
): GalleryFeedResponse {
  if (input.viewer.isGuest) {
    return {
      items: [],
      albums: [],
      viewer: {
        isGuest: true,
        canUpload: false,
        canModerate: false,
      },
      storage: { uploadEnabled: false },
      generatedAt: input.generatedAt.toISOString(),
    };
  }

  const albums = buildAlbums(input.reports);
  const albumBySessionId = new Map(
    albums.map((album) => [album.sessionId, album]),
  );
  const items = [
    ...buildSessionItems(input.reports, albumBySessionId),
    ...buildFanartItems(input.fanarts, albumBySessionId, input.viewer),
  ].sort(
    (left, right) =>
      Date.parse(right.createdAt) - Date.parse(left.createdAt),
  );

  return {
    items,
    albums,
    viewer: {
      isGuest: false,
      canUpload: true,
      canModerate: input.viewer.canModerate,
    },
    storage: { uploadEnabled: input.uploadEnabled },
    generatedAt: input.generatedAt.toISOString(),
  };
}
