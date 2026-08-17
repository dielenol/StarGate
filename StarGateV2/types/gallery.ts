export type GalleryItemKind = "SESSION" | "FANART";
export type GalleryFanartStatus = "PUBLISHED" | "HIDDEN" | "DELETED";

export interface GalleryImageDto {
  src: string;
  fullSrc: string;
  alt: string;
  width: number | null;
  height: number | null;
}

export interface GalleryAlbumDto {
  sessionId: string;
  series: "regular" | "mini";
  reportNumber: string;
  title: string;
  href: string;
}

interface GalleryItemBase {
  id: string;
  kind: GalleryItemKind;
  title: string;
  description: string;
  image: GalleryImageDto;
  albumSessionId: string | null;
  tags: string[];
  createdAt: string;
}

export interface GallerySessionItemDto extends GalleryItemBase {
  kind: "SESSION";
}

export interface GalleryFanartItemDto extends GalleryItemBase {
  kind: "FANART";
  artistName: string;
  authorName: string;
  status: Exclude<GalleryFanartStatus, "DELETED">;
  hiddenReason: string | null;
  canEdit: boolean;
  canDelete: boolean;
  canModerate: boolean;
  updatedAt: string;
}

export type GalleryItemDto =
  | GallerySessionItemDto
  | GalleryFanartItemDto;

export interface GalleryFeedResponse {
  items: GalleryItemDto[];
  albums: GalleryAlbumDto[];
  viewer: {
    isGuest: boolean;
    canUpload: boolean;
    canModerate: boolean;
  };
  storage: {
    uploadEnabled: boolean;
  };
  generatedAt: string;
}

export interface GalleryFanartMetadataInput {
  title: string;
  description: string;
  artistName: string;
  altText: string;
  tags: string[];
  sessionId: string | null;
  rightsConfirmed: true;
}

export interface GalleryFanartMetadataUpdateInput
  extends GalleryFanartMetadataInput {
  expectedUpdatedAt: string;
}

export interface GalleryFanartModerationInput {
  status: Exclude<GalleryFanartStatus, "DELETED">;
  reason: string;
  expectedUpdatedAt: string;
}
