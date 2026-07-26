import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import type { PlatformPlan } from "../../../shared/contracts/platform";
import { recordBrowserEvent } from "../../../shared/telemetry/browserTelemetry";
import { fetchPlatformPlans } from "../api/platformPlansApi";

export function usePlatformPlans(user: User | null): {
  plans: PlatformPlan[];
  status: string;
} {
  const [plans, setPlans] = useState<PlatformPlan[]>([]);
  const [status, setStatus] = useState("Loading platform plans...");

  useEffect(() => {
    if (!user) {
      setPlans([]);
      setStatus("Platform plans require a signed-in operator.");
      return;
    }

    let cancelled = false;
    setStatus("Loading platform plans...");

    fetchPlatformPlans(user)
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
          setStatus(error instanceof Error ? error.message : "Platform plans could not reach the server.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  return { plans, status };
}
