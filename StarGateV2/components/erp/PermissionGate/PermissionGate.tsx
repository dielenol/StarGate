"use client";

import { useSession } from "next-auth/react";

import type { UserRole } from "@/types/user";
import { hasRole } from "@/lib/auth/rbac";

interface PermissionGateProps {
  minRole: UserRole;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export default function PermissionGate({
  minRole,
  children,
  fallback = null,
}: PermissionGateProps) {
  const { data: session } = useSession();

  if (!session?.user || !hasRole(session.user.role, minRole)) {
    return fallback;
  }

  return children;
}
