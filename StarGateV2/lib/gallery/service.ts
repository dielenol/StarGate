import "server-only";

import type { Session } from "next-auth";

import { hasGalleryPageAccess } from "@/lib/gallery/access";
import { getGalleryBlobToken } from "@/lib/gallery/blob-config";
import { hasRole } from "@/lib/auth/rbac";
import {
  listGalleryFanartsForViewer,
  listGallerySessionReports,
} from "@/lib/db/gallery";
import type { GalleryFeedResponse } from "@/types/gallery";

import { buildGalleryFeed } from "./feed";

type GalleryViewer = Session["user"];

export async function getGalleryFeedResponse(
  viewer: GalleryViewer,
  options: { accessGranted?: boolean; localPreview?: boolean } = {},
): Promise<GalleryFeedResponse> {
  const now = new Date();
  if (
    viewer.isGuest ||
    !(
      options.accessGranted === true ||
      (await hasGalleryPageAccess(viewer, {
        localPreview: options.localPreview === true,
      }))
    )
  ) {
    return buildGalleryFeed({
      reports: [],
      fanarts: [],
      viewer: {
        id: viewer.id,
        isGuest: true,
        canModerate: false,
        canCleanupOrphans: false,
      },
      uploadEnabled: false,
      generatedAt: now,
    });
  }

  const reports = await listGallerySessionReports(viewer.role);
  const fanarts = await listGalleryFanartsForViewer({
    viewerId: viewer.id,
    canModerate: hasRole(viewer.role, "V"),
    canCleanupOrphans: viewer.role === "GM",
    visibleSessionIds: reports.map((report) => report.sessionId),
  });

  return buildGalleryFeed({
    reports,
    fanarts,
    viewer: {
      id: viewer.id,
      isGuest: false,
      canModerate: hasRole(viewer.role, "V"),
      canCleanupOrphans: viewer.role === "GM",
    },
    uploadEnabled: Boolean(getGalleryBlobToken()),
    generatedAt: now,
  });
}
