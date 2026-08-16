import "server-only";

export function getGalleryBlobToken(): string | null {
  return process.env.GALLERY_BLOB_READ_WRITE_TOKEN?.trim() || null;
}
