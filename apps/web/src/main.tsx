import React, { Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { type Auth, type User } from "firebase/auth";
import "./styles.css";
import "./features/quotes/components/quoteTemplates/quoteTemplates.css";
import "./features/jobs/components/jobCore/jobCore.css";
import "./features/visits/components/visitCore/visitCore.css";
import "./features/invoices/components/invoiceStructure/invoiceStructure.css";
import "./features/invoices/components/paymentRails/paymentRails.css";
import "./features/nexopsShell/documentPrimitives.css";
import "./features/quotes/components/quoteEngine/quoteEngine.css";
import "./features/settings/components/catalog/catalog.css";
import "./features/settings/components/tenantConfig/tenantConfig.css";
import { NexOpsWorkspace } from "./features/nexopsShell/NexOpsWorkspace";
import { AppBootstrap } from "./shared/app/AppBootstrap";
import { signOutOperator } from "./shared/auth/authBootstrap";
import { NexiStandaloneChat } from "./features/nexi/areas/chat/components/NexiStandaloneChat";
import { NexCamPage } from "./features/nexcam/areas/capture/components/NexCamPage";













const NexReachPage = React.lazy(async () => ({ default: (await import("./nexreach")).NexReachPage }));

interface PlatformPlan {
  id: "nexi" | "marketing" | "suite";
  name: string;
  monthlyUsd: number;
  modules: string[];
}

interface PlatformTenantRow {
  tenant: {
    id: string;
    name: string;
    plan: "nexi" | "marketing" | "suite";
  };
  plan: PlatformPlan;
  modules: string[];
  subscription?: {
    status: string;
    stripeSubscriptionId?: string;
  } | null;
  adapterStatuses: Array<{
    adapter: string;
    provider: string;
    configured: boolean;
    ok: boolean;
    detail?: string;
  }>;
  cost: {
    estimatedCostUsd: number;
    usageLogCount: number;
  };
}

interface PlatformTenantResponse {
  ok: boolean;
  tenants?: PlatformTenantRow[];
  error?: string;
}

interface PlatformPlansResponse {
  ok: boolean;
  plans?: PlatformPlan[];
  error?: string;
}

function PlatformConsole(props: { auth: Auth | null; user: User }): React.ReactElement {
  const [rows, setRows] = useState<PlatformTenantRow[]>([]);
  const [plans, setPlans] = useState<PlatformPlan[]>([]);
  const [status, setStatus] = useState("Loading platform console...");
  const [workingTenant, setWorkingTenant] = useState("");

  async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
    const token = await props.user.getIdToken();
    return fetch(path, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      }
    });
  }

  async function refresh(): Promise<void> {
    setStatus("Loading platform console...");
    try {
      const [tenantBody, planBody] = await Promise.all([
        authedFetch("/api/platform/tenants").then((response) => response.json() as Promise<PlatformTenantResponse>),
        authedFetch("/api/platform/plans").then((response) => response.json() as Promise<PlatformPlansResponse>)
      ]);
      if (!tenantBody.ok || !planBody.ok) {
        setStatus(tenantBody.error ?? planBody.error ?? "Platform console unavailable.");
        return;
      }
      setRows(tenantBody.tenants ?? []);
      setPlans(planBody.plans ?? []);
      setStatus("");
    } catch {
      setStatus("Platform console could not reach the server.");
    }
  }

  async function runBackup(tenantId: string): Promise<void> {
    setWorkingTenant(tenantId);
    setStatus(`Running backup for ${tenantId}...`);
    try {
      const body = await authedFetch(`/api/platform/tenants/${encodeURIComponent(tenantId)}/backups/run`, { method: "POST", body: "{}" })
        .then((response) => response.json() as Promise<{ ok: boolean; backup?: { storageRef: string }; error?: string }>);
      setStatus(body.ok ? `Backup saved: ${body.backup?.storageRef ?? "storage file"}` : body.error ?? "Backup failed.");
      await refresh();
    } catch {
      setStatus("Backup request failed.");
    } finally {
      setWorkingTenant("");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <main className="shell platform-shell">
      <section className="platform-hero">
        <div>
          <p className="eyebrow">M13 Platform</p>
          <h1>Tenant Command Center</h1>
          <p className="signed-in">{props.user.email ?? "Platform operator"}</p>
        </div>
        <button className="sign-out" type="button" onClick={() => void signOutOperator(props.auth)}>Sign out</button>
      </section>

      <section className="plan-grid">
        {plans.map((plan) => (
          <article className="plan-card" key={plan.id}>
            <p className="eyebrow">{plan.id}</p>
            <h2>{plan.name}</h2>
            <p className="plan-price">${plan.monthlyUsd}/mo</p>
            <p>{plan.modules.join(", ")}</p>
          </article>
        ))}
      </section>

      {status ? <p className="schedule-status">{status}</p> : null}

      <section className="tenant-table">
        {rows.map((row) => (
          <article className="tenant-row" key={row.tenant.id}>
            <div>
              <p className="eyebrow">{row.tenant.id}</p>
              <h2>{row.tenant.name}</h2>
              <p>{row.plan.name} plan · {row.subscription?.status ?? "no subscription"} · ${row.cost.estimatedCostUsd.toFixed(4)} tracked</p>
            </div>
            <div className="adapter-pills">
              {row.adapterStatuses.map((adapter) => (
                <span className={adapter.ok ? "pill ok" : "pill warn"} key={adapter.adapter}>
                  {adapter.adapter}: {adapter.configured ? adapter.provider : "not set"}
                </span>
              ))}
            </div>
            <div className="tenant-actions">
              <a href={`/api/platform/tenants/${encodeURIComponent(row.tenant.id)}/export`} target="_blank" rel="noreferrer">Export</a>
              <button type="button" disabled={workingTenant === row.tenant.id} onClick={() => void runBackup(row.tenant.id)}>
                {workingTenant === row.tenant.id ? "Backing up..." : "Run backup"}
              </button>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <AppBootstrap
      renderAuthenticated={({ auth, user }) => {
        if (window.location.pathname.startsWith("/platform")) return <PlatformConsole auth={auth} user={user} />;
        if (window.location.pathname.startsWith("/nexcam")) return <NexCamPage auth={auth} user={user} />;
        if (window.location.pathname.startsWith("/nexreach")) {
          return <Suspense fallback={<main className="shell"><section className="auth-card"><h1>Loading NexReach</h1></section></main>}><NexReachPage auth={auth} user={user} /></Suspense>;
        }
        if (window.location.pathname.startsWith("/nexops")) return <NexOpsWorkspace auth={auth} user={user} />;
        return <NexiStandaloneChat auth={auth} user={user} />;
      }}
    />
  );
}

