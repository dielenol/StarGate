import "server-only";

import { del } from "@vercel/blob";

import {
  listGalleryDocumentBlobCleanupPending,
  listGalleryOrphanBlobCleanupPending,
  isGalleryBlobReferenced,
  markGalleryBlobUploadIntentComplete,
  markGalleryBlobCleanupComplete,
  markGalleryOrphanBlobCleanupComplete,
  recordGalleryDocumentBlobCleanupFailure,
  recordGalleryOrphanBlobCleanup,
} from "@/lib/db/gallery";

interface GalleryBlobReference {
  pathname: string;
}

export async function compensateGalleryBlobUpload(
  blob: GalleryBlobReference,
  token: string,
): Promise<void> {
  try {
    await del(blob.pathname, { token });
    await markGalleryBlobUploadIntentComplete(blob.pathname);
  } catch (error) {
    console.error("[gallery] failed to compensate Blob upload", error);
    try {
      await recordGalleryOrphanBlobCleanup({
        ...blob,
        now: new Date(),
      });
    } catch (queueError) {
      console.error("[gallery] failed to queue orphan Blob cleanup", queueError);
    }
  }
}

export async function compensateGalleryBlobUploads(
  blobs: readonly GalleryBlobReference[],
  token: string,
): Promise<void> {
  await Promise.all(
    blobs.map((blob) => compensateGalleryBlobUpload(blob, token)),
  );
}

export async function deleteGalleryDocumentBlobs(
  input: { id: string; pathnames: readonly string[] },
  token: string,
): Promise<boolean> {
  try {
    await del([...input.pathnames], { token });
    await markGalleryBlobCleanupComplete(input.id);
    return true;
  } catch (error) {
    console.error("[gallery] failed to delete Blob", error);
    try {
      await recordGalleryDocumentBlobCleanupFailure({
        id: input.id,
        now: new Date(),
      });
    } catch (queueError) {
      console.error(
        "[gallery] failed to defer document Blob cleanup",
        queueError,
      );
    }
    return false;
  }
}

export async function retryGalleryBlobCleanup(token: string): Promise<void> {
  const [documents, orphans] = await Promise.all([
    listGalleryDocumentBlobCleanupPending(),
    listGalleryOrphanBlobCleanupPending(),
  ]);

  for (const document of documents) {
    await deleteGalleryDocumentBlobs(
      {
        id: document._id,
        pathnames: [
          document.image.pathname,
          ...(document.image.thumbnail
            ? [document.image.thumbnail.pathname]
            : []),
        ],
      },
      token,
    );
  }

  for (const orphan of orphans) {
    try {
      if (await isGalleryBlobReferenced(orphan.pathname)) {
        await markGalleryOrphanBlobCleanupComplete(orphan._id);
        continue;
      }
      await del(orphan.pathname, { token });
      await markGalleryOrphanBlobCleanupComplete(orphan._id);
    } catch (error) {
      console.error("[gallery] orphan Blob cleanup retry failed", error);
      try {
        await recordGalleryOrphanBlobCleanup({
          pathname: orphan.pathname,
          now: new Date(),
        });
      } catch (queueError) {
        console.error("[gallery] failed to update Blob cleanup retry", queueError);
      }
    }
  }
}
