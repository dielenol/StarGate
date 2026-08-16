import "server-only";

import { createHash } from "node:crypto";

import type { GalleryFanartMetadataInput } from "@/types/gallery";

export function galleryFanartRequestFingerprint(input: {
  imageSha256: string;
  metadata: GalleryFanartMetadataInput;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        title: input.metadata.title,
        description: input.metadata.description,
        artistName: input.metadata.artistName,
        altText: input.metadata.altText,
        tags: input.metadata.tags,
        sessionId: input.metadata.sessionId,
        rightsConfirmed: input.metadata.rightsConfirmed,
        imageSha256: input.imageSha256,
      }),
    )
    .digest("hex");
}
