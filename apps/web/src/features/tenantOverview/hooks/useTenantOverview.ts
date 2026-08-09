import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import type { PlatformTenantRow } from "../../../shared/contracts/platform";
import { recordBrowserEvent } from "../../../shared/telemetry/browserTelemetry";
import { fetchTenantOverview, runTenantBackup } from "../api/tenantOverviewApi";

export function useTenantOverview(user: User | null): {
  rows: PlatformTenantRow[];
  runBackup: (tenantId: string) => Promise<void>;
  status: string;
  workingTenant: string;
} {
  const [rows, setRows] = useState<PlatformTenantRow[]>([]);
  const [status, setStatus] = useState("Loading tenant overview...");
  const [workingTenant, setWorkingTenant] = useState("");

  useEffect(() => {
    if (!user) {
      setRows([]);
      setStatus("Tenant overview requires a signed-in operator.");
      return;
    }

    let cancelled = false;
    setStatus("Loading tenant overview...");

    fetchTenantOverview(user)
      .then((nextRows) => {
        if (!cancelled) {
          setRows(nextRows);
          setStatus("");
        }
      })
      .catch((error) => {
        recordBrowserEvent("tenant_overview.load_failed", {
          error: error instanceof Error ? error.message : "unknown"
        });
        if (!cancelled) {
          setRows([]);
          setStatus("Data query needs attention. NexTeam has logged the issue.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  async function runBackupForTenant(tenantId: string): Promise<void> {
    if (!user) {
      return;
    }

    setWorkingTenant(tenantId);
    setStatus(`Running backup for ${tenantId}...`);

    try {
      const body = await runTenantBackup(user, tenantId);
      setStatus(body.ok ? `Backup saved: ${body.backup?.storageRef ?? "storage file"}` : body.error ?? "Backup failed.");
      setRows(await fetchTenantOverview(user));
    } catch (error) {
      recordBrowserEvent("tenant_overview.backup_failed", {
        error: error instanceof Error ? error.message : "unknown",
        tenantId
      });
      setStatus("Backup request failed.");
    } finally {
      setWorkingTenant("");
    }
  }

  return {
    rows,
    runBackup: runBackupForTenant,
    status,
    workingTenant
  };
}
