import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { FirebaseTenantAccessBootstrap } from "./features/auth/components/FirebaseTenantAccessBootstrap.jsx";

const AgentArchitectShell = lazy(() =>
  import("./features/agentArchitect/components/AgentArchitectShell").then((module) => ({
    default: module.AgentArchitectShell,
  }))
);
const SuccessScreen = lazy(() => import("./features/agentArchitect/components/SuccessScreen"));
const SessionsView = lazy(() =>
  import("./features/admin/components/sessionsview").then((module) => ({
    default: module.SessionsView,
  }))
);
const AdminGate = lazy(() =>
  import("./features/admin/components/admingate").then((module) => ({
    default: module.AdminGate,
  }))
);
const NjordMissionControl = lazy(() =>
  import("./features/missioncontrol/components/NjordMissionControl").then((module) => ({
    default: module.NjordMissionControl,
  }))
);
const NjordShell = lazy(() =>
  import("./features/missioncontrol/components/NjordShell").then((module) => ({
    default: module.NjordShell,
  }))
);
const MissionControlGate = lazy(() =>
  import("./features/missioncontrol/components/MissionControlGate").then((module) => ({
    default: module.MissionControlGate,
  }))
);
const AquatraceDashboard = lazy(() =>
  import("./features/missioncontrol/components/AquatraceDashboard").then((module) => ({
    default: module.AquatraceDashboard,
  }))
);
const MissionControlHome = lazy(() =>
  import("./features/missioncontrol/components/MissionControlHome").then((module) => ({
    default: module.MissionControlHome,
  }))
);
const TenantWorkspaceShell = lazy(() =>
  import("./features/missioncontrol/components/TenantWorkspaceShell").then((module) => ({
    default: module.TenantWorkspaceShell,
  }))
);
const GoogleBusinessProfileRail = lazy(() =>
  import("./features/missioncontrol/components/GoogleBusinessProfileRail").then((module) => ({
    default: module.GoogleBusinessProfileRail,
  }))
);
const NexiBlueprintBetaPage = lazy(() => import("./features/marketing/components/NexiBlueprintBetaPage"));
const NexiJobDeskPage = lazy(() => import("./features/nexiV1/components/NexiJobDeskPage.jsx"));

function RouteFallback() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0A0A14",
        color: "#ffffff",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      Loading...
    </div>
  );
}

export function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<Navigate to="/agent-architect" replace />} />
        <Route
          path="/agent-architect"
          element={
            <FirebaseTenantAccessBootstrap>
              <AgentArchitectShell />
            </FirebaseTenantAccessBootstrap>
          }
        />
        <Route path="/nexi-blueprint-beta" element={<NexiBlueprintBetaPage />} />
        <Route
          path="/nexi-job-desk"
          element={
            <AdminGate>
              <NexiJobDeskPage />
            </AdminGate>
          }
        />
        <Route path="/success" element={<SuccessScreen />} />

        <Route
          path="/admin/sessions"
          element={
            <AdminGate>
              <SessionsView />
            </AdminGate>
          }
        />

        <Route
          path="/mission-control/clients"
          element={
            <AdminGate>
              <MissionControlHome />
            </AdminGate>
          }
        />

        <Route
          path="/mission-control/aquatrace"
          element={
            <AdminGate>
              <AquatraceDashboard />
            </AdminGate>
          }
        />

        <Route
          path="/mission-control/google-business-profile"
          element={
            <AdminGate>
              <GoogleBusinessProfileRail />
            </AdminGate>
          }
        />

        <Route
          path="/mission-control/:tenantId"
          element={
            <AdminGate>
              <TenantWorkspaceShell />
            </AdminGate>
          }
        />

        <Route
          path="/mission-control/:tenantId/workspace"
          element={
            <AdminGate>
              <TenantWorkspaceShell />
            </AdminGate>
          }
        />

        <Route
          path="/mission-control/aquatrace/workspace"
          element={
            <AdminGate>
              <NjordShell />
            </AdminGate>
          }
        />

        <Route
          path="/mission-control/aquatrace-case-study"
          element={<Navigate to="/mission-control/aquatrace/workspace" replace />}
        />

        <Route
          path="/mission-control"
          element={
            <AdminGate>
              <MissionControlGate>
                <NjordMissionControl />
              </MissionControlGate>
            </AdminGate>
          }
        />
      </Routes>
    </Suspense>
  );
}
