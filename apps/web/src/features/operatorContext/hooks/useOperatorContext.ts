import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { recordBrowserEvent } from "../../../shared/telemetry/browserTelemetry";
import type { OperatorContext, TenantRole } from "../types";

function claimString(claims: Record<string, unknown>, key: string): string | undefined {
  const value = claims[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function claimRole(claims: Record<string, unknown>): TenantRole {
  const explicit = claimString(claims, "tenantRole") ?? claimString(claims, "role");
  const roles = Array.isArray(claims.roles) ? claims.roles.map((role) => String(role).toUpperCase()) : [];
  const candidates = [explicit, ...roles]
    .filter(Boolean)
    .map((role) => String(role).toUpperCase());

  if (candidates.includes("OFFICE_ADMIN") || candidates.includes("OFFICE") || candidates.includes("ADMIN")) {
    return "OFFICE_ADMIN";
  }
  if (candidates.includes("TECHNICIAN") || candidates.includes("TECH")) {
    return "TECHNICIAN";
  }
  return "OWNER";
}

export function createFallbackOperatorContext(user: User | null): OperatorContext {
  return {
    tenantId: null,
    tenantUserId: user?.uid ?? "anonymous",
    role: "OWNER"
  };
}

export function extractOperatorContext(user: User, claims: Record<string, unknown>): OperatorContext {
  return {
    tenantId: claimString(claims, "tenantId") ?? claimString(claims, "tenant_id") ?? null,
    tenantUserId: claimString(claims, "tenantUserId") ?? user.uid,
    role: claimRole(claims)
  };
}

export function useOperatorContext(user: User | null): OperatorContext {
  const [context, setContext] = useState<OperatorContext>(() => createFallbackOperatorContext(user));

  useEffect(() => {
    if (!user) {
      setContext(createFallbackOperatorContext(null));
      return;
    }

    let cancelled = false;
    setContext(createFallbackOperatorContext(user));

    user.getIdTokenResult()
      .then((token) => {
        if (!cancelled) {
          setContext(extractOperatorContext(user, token.claims as Record<string, unknown>));
        }
      })
      .catch((error) => {
        recordBrowserEvent("operator_context.load_failed", {
          error: error instanceof Error ? error.message : "unknown"
        });
        if (!cancelled) {
          setContext(createFallbackOperatorContext(user));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  return context;
}
