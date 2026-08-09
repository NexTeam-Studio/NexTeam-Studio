import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { recordBrowserEvent } from "../../../shared/telemetry/browserTelemetry";
import { fetchPilotSubscriptionPackages, type PilotSubscriptionPackage } from "../api/platformPlansApi";

export function usePlatformPlans(user: User | null): {
  plans: PilotSubscriptionPackage[];
  status: string;
} {
  const [plans, setPlans] = useState<PlatformPlan[]>([]);
  const [status, setStatus] = useState("Loading platform plans...");

  useEffect(() => {
    if (!user) {
      setPlans([]);
      setStatus("Pilot package details require a signed-in platform operator.");
      return;
    }

    let cancelled = false;
    setStatus("Loading pilot package...");

    fetchPilotSubscriptionPackages(user)
      .then((nextPlans) => {
        if (!cancelled) {
          setPlans(nextPlans);
          setStatus("");
        }
      })
      .catch((error) => {
        recordBrowserEvent("platform_overview.load_failed", {
          error: error instanceof Error ? error.message : "unknown"
        });
        if (!cancelled) {
          setPlans([]);
          setStatus(error instanceof Error ? error.message : "Pilot package details could not reach the server.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  return { plans, status };
}
