"use client";

import { useEffect } from "react";

import { useNavPending } from "./NavPendingProvider";

export default function RouteLoadingProbe() {
  const { beginRouteLoading, endRouteLoading } = useNavPending();

  useEffect(() => {
    beginRouteLoading();
    return endRouteLoading;
  }, [beginRouteLoading, endRouteLoading]);

  return null;
}
