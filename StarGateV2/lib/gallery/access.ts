import "server-only";

import type { Session } from "next-auth";

import { isNavPathLocked } from "@/components/erp/nav-config";
import { hasRole } from "@/lib/auth/rbac";
import { getErpPageLockOverrides } from "@/lib/db/erp-page-locks";
import { shouldBypassPageLocks } from "@/lib/erp/local-page-lock-bypass";

const GALLERY_PATH = "/erp/gallery";

export async function hasGalleryPageAccess(
  user: Session["user"],
  options: { localPreview: boolean },
): Promise<boolean> {
  if (hasRole(user.role, "GM") || options.localPreview) return true;
  return !isNavPathLocked(GALLERY_PATH, await getErpPageLockOverrides());
}

export async function hasGalleryApiAccess(
  user: Session["user"],
  request: Request,
): Promise<boolean> {
  const hostname = new URL(request.url).hostname;
  return hasGalleryPageAccess(user, {
    localPreview: shouldBypassPageLocks({
      hostname,
      nodeEnv: process.env.NODE_ENV,
    }),
  });
}
