import { redirect } from "next/navigation";

import PageHead from "@/components/ui/PageHead/PageHead";
import { getActiveSession } from "@/lib/auth/active-session";
import { hasRole } from "@/lib/auth/rbac";
import { getVttRuntimeStatus } from "@/lib/vtt-runtime/control-client";
import {
  getVttHostStatus,
  isVttHostControlModeEnabled,
} from "@/lib/vtt-runtime/host-control-client";

import VttHostControlClient from "./VttHostControlClient";
import VttRuntimeClient from "./VttRuntimeClient";
import styles from "./vtt.module.css";

export const dynamic = "force-dynamic";

export default async function VttRuntimePage() {
  const session = await getActiveSession();
  if (!session?.user) redirect("/login");
  if (!hasRole(session.user.role, "GM")) redirect("/erp");

  const hostControlEnabled = isVttHostControlModeEnabled();
  const [hostStatus, runtimeStatus] = await Promise.all([
    hostControlEnabled ? getVttHostStatus() : Promise.resolve(null),
    getVttRuntimeStatus(),
  ]);

  return (
    <>
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "ADMIN", href: "/erp/admin" },
          { label: "VTT 운영" },
        ]}
        title="VTT 운영"
      />
      <main className={styles.root}>
        {hostStatus ? (
          <VttHostControlClient initialStatus={hostStatus} />
        ) : null}
        <VttRuntimeClient
          initialStatus={runtimeStatus}
          initialHostStatus={hostStatus}
        />
      </main>
    </>
  );
}
