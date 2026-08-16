import { redirect } from "next/navigation";

import { getActiveSession } from "@/lib/auth/active-session";
import { getGalleryFeedResponse } from "@/lib/gallery/service";
import { hasLocalErpPreviewAccess } from "@/lib/erp/local-page-access";
import type { GalleryFeedResponse } from "@/types/gallery";

import PageHead from "@/components/ui/PageHead/PageHead";

import GalleryClient from "./GalleryClient";

function emptyGalleryFeed(isGuest: boolean): GalleryFeedResponse {
  return {
    items: [],
    albums: [],
    viewer: { isGuest, canUpload: false, canModerate: false },
    storage: { uploadEnabled: false },
    generatedAt: new Date(0).toISOString(),
  };
}

export default async function GalleryPage() {
  const session = await getActiveSession();

  if (!session?.user) {
    redirect("/login");
  }

  let initialData: GalleryFeedResponse;
  let initialDataUpdatedAt = 0;

  try {
    const localPreview = await hasLocalErpPreviewAccess();
    initialData = await getGalleryFeedResponse(session.user, { localPreview });
    initialDataUpdatedAt = new Date(initialData.generatedAt).getTime();
  } catch {
    initialData = emptyGalleryFeed(Boolean(session.user.isGuest));
  }

  return (
    <div data-pixel-font="ui">
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "GALLERY" },
        ]}
        title="갤러리"
      />
      <GalleryClient
        initialData={initialData}
        initialDataUpdatedAt={initialDataUpdatedAt}
      />
    </div>
  );
}
