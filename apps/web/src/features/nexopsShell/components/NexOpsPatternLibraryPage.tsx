import React from "react";
import { ModuleHeroCard } from "../../../shared/ui/NexOpsBusinessTemplates";
import { NexOpsNavGlyph } from "../workspaceSupport";
import {
  NexopsAccessibleList,
  NexopsActionButton,
  NexopsActionRail,
  NexopsBanner,
  NexopsConfirmationPanel,
  NexopsConflictCard,
  NexopsDrawerFrame,
  NexopsEmptyState,
  NexopsFieldCommandHeader,
  NexopsHomeShell,
  NexopsHomeZoneCard,
  NexopsModalFrame,
  NexopsProgressStrip,
  NexopsSectionCard,
  NexopsStatusPill,
  NexopsTabSet,
  NexopsUploadQueue
} from "../../../shared/ui/NexOpsUiKit";

export function NexOpsPatternLibraryPage(): React.ReactElement {
  return (
    <section className="nexops-pattern-page">
      <ModuleHeroCard eyebrow="Track 1" title="NexOps Pattern Library" detail="Neutral placeholders only. This is the reusable action, state, and shell language for every later workflow." icon={<NexOpsNavGlyph module="patterns" />} />

      <NexopsFieldCommandHeader
        customer="Customer name"
        address="123 Placeholder Rd, Seneca SC"
        status="Waiting to sync"
        arrivalWindow="Today, 1:00 PM - 3:00 PM"
      />

      <div className="nexops-pattern-grid">
        <NexopsSectionCard
          eyebrow="Rule 1"
          title="Dominant action hierarchy"
          detail="One obvious move, quieter secondary actions, and a named blocker when something cannot proceed."
        >
          <NexopsActionRail
            dominant={<NexopsActionButton label="Primary action" tone="dominant" hint="Ready now" />}
            secondary={(
              <>
                <NexopsActionButton label="Secondary action" tone="secondary" />
                <NexopsActionButton label="Quiet link" tone="quiet" />
              </>
            )}
            utility={<NexopsActionButton label="Blocked action" tone="blocked" disabled hint="Needs connection" />}
          />
        </NexopsSectionCard>

        <NexopsSectionCard eyebrow="Rule 13" title="Signal, stale, and sync banners" detail="Offline and weak-signal states stay visible and actionable.">
          <div className="nexops-pattern-stack">
            <NexopsBanner title="Weak signal" detail="Changes save locally first and sync when connection steadies." tone="warning" action={<NexopsActionButton label="See queue" tone="quiet" />} />
            <NexopsBanner title="Stale data" detail="This screen is 6 minutes old. Refresh before making a money move." tone="blocked" action={<NexopsActionButton label="Refresh now" tone="secondary" />} />
            <NexopsBanner title="Back online" detail="Queued changes are syncing now." tone="success" action={<NexopsStatusPill label="3 items" tone="success" />} />
          </div>
        </NexopsSectionCard>

        <NexopsSectionCard eyebrow="Rule 14" title="Loading and progress" detail="Waiting states stay specific so users know whether to pause, retry, or keep moving.">
          <div className="nexops-pattern-stack">
            <NexopsProgressStrip label="Saving draft" detail="Local write complete. Waiting for the server." percent={62} />
            <NexopsProgressStrip label="Uploading media" detail="2 of 3 files have finished." percent={78} />
          </div>
        </NexopsSectionCard>

        <NexopsSectionCard eyebrow="Rule 26" title="Conflict resolution" detail="Conflicts surface as a deliberate compare-or-choose step, never a silent overwrite.">
          <NexopsConflictCard
            title="Two people changed the same note"
            localVersion="Your edit keeps the photo note and updated arrival details."
            serverVersion="The office edit adds a blocked-gate warning from a later call."
            consequence="Choose one version or compare before sending anything customer-facing."
          />
        </NexopsSectionCard>
      </div>

      <NexopsSectionCard eyebrow="Rule 28" title="All six empty-state types" detail="Different empty states explain different next moves.">
        <div className="nexops-pattern-empty-grid">
          <NexopsEmptyState kind="fresh" title="Nothing here yet" detail="Start with the first record and this list fills in from there." action={<NexopsActionButton label="Primary action" tone="dominant" />} />
          <NexopsEmptyState kind="filtered" title="No results for this filter" detail="Clear a filter or widen the date range." action={<NexopsActionButton label="Reset filters" tone="secondary" />} />
          <NexopsEmptyState kind="completed" title="All caught up" detail="There is nothing waiting right now." />
          <NexopsEmptyState kind="blocked" title="This view is blocked" detail="A required permission or connected account is still missing." action={<NexopsActionButton label="See blocker" tone="blocked" disabled />} />
          <NexopsEmptyState kind="offline" title="Offline right now" detail="Reconnect to pull the latest server copy." action={<NexopsActionButton label="Retry when online" tone="quiet" />} />
          <NexopsEmptyState kind="error" title="Could not load this view" detail="The server returned a bad response. Keep your current work and retry." action={<NexopsActionButton label="Try again" tone="secondary" />} />
        </div>
      </NexopsSectionCard>

      <div className="nexops-pattern-grid">
        <NexopsSectionCard eyebrow="Rule 18" title="Confirmation and undo tiers" detail="The chat-native yes / no / make changes pattern stays aligned with the visual UI.">
          <div className="nexops-pattern-stack">
            <NexopsConfirmationPanel title="Undo-ready action" detail="This can be reversed for a short window." consequence="You can undo this for 10 seconds." tier="undo" primaryLabel="Do it" />
            <NexopsConfirmationPanel title="Financial action" detail="Money movement needs an explicit pause." consequence="Charging now will finalize this payment attempt." tier="financial" primaryLabel="Charge now" />
          </div>
        </NexopsSectionCard>

        <NexopsSectionCard eyebrow="Rule 9" title="Forms, tabs, and accessible structure" detail="Dense data entry stays readable, touch-safe, and keyboard reachable.">
          <div className="nexops-pattern-stack">
            <NexopsTabSet tabs={[
              { id: "details", label: "Details", active: true },
              { id: "billing", label: "Billing" },
              { id: "history", label: "History" }
            ]} />
            <div className="nexops-pattern-form-grid">
              <label>
                <span>Name</span>
                <input placeholder="Required field" />
              </label>
              <label>
                <span>Telephone</span>
                <input placeholder="Required field" />
              </label>
              <label className="wide">
                <span>Address</span>
                <input placeholder="Required field" />
              </label>
              <label className="wide">
                <span>Email (encouraged)</span>
                <input placeholder="Helpful for confirmations" />
              </label>
            </div>
          </div>
        </NexopsSectionCard>

        <NexopsSectionCard eyebrow="Rule 22" title="Media and upload queue" detail="Photos and reports show their sync state instead of vanishing into a spinner.">
          <NexopsUploadQueue items={[
            { id: "u1", label: "Leak-photo-01.jpg", detail: "Waiting for stronger signal", progress: 24, status: "paused" },
            { id: "u2", label: "Pressure-test.mp4", detail: "Uploading from local cache", progress: 61, status: "syncing" },
            { id: "u3", label: "Customer-report.pdf", detail: "Server copy finished", progress: 100, status: "done" }
          ]} />
        </NexopsSectionCard>
      </div>

      <div className="nexops-pattern-grid">
        <NexopsSectionCard eyebrow="Rule 20" title="Modal, drawer, and list patterns" detail="Short flows can stay inline; longer ones move into a drawer or modal without losing context.">
          <div className="nexops-pattern-stack">
            <NexopsModalFrame
              title="Accessible modal"
              detail="Short confirmation or one focused edit."
              footer={<NexopsActionRail dominant={<NexopsActionButton label="Save" tone="dominant" />} secondary={<NexopsActionButton label="Cancel" tone="secondary" />} />}
            >
              <p>Keep this focused. The dominant action should remain visible without repeating it in multiple places.</p>
            </NexopsModalFrame>
            <NexopsDrawerFrame title="Accessible drawer" detail="Longer side-by-side editing without leaving the current page.">
              <NexopsAccessibleList
                title="Drawer list"
                items={[
                  { id: "a", title: "Waiting to sync", detail: "Created on this device first.", state: "Waiting" },
                  { id: "b", title: "Blocked action", detail: "Requires a connected account before send.", state: "Blocked" }
                ]}
              />
            </NexopsDrawerFrame>
          </div>
        </NexopsSectionCard>

        <NexopsSectionCard eyebrow="Rule 29" title="Status vocabulary" detail="State language stays consistent across shell, cards, and action blockers.">
          <div className="nexops-pattern-pill-row">
            <NexopsStatusPill label="Waiting to sync" tone="warning" />
            <NexopsStatusPill label="Ready" tone="success" />
            <NexopsStatusPill label="Blocked" tone="blocked" />
            <NexopsStatusPill label="Needs review" tone="secondary" />
            <NexopsStatusPill label="Done" tone="quiet" />
          </div>
        </NexopsSectionCard>
      </div>

      <NexopsSectionCard eyebrow="Rule 17" title="Home surface shell" detail="Four zones only: now, needs attention, upcoming, and business overview.">
        <NexopsHomeShell
          now={<NexopsHomeZoneCard title="Primary action" summary="This is the clearest next move based on the current state." dominantLabel="Start now" />}
          needsAttention={<NexopsHomeZoneCard title="Blocked action" summary="A named blocker explains why this cannot move yet." dominantLabel="Resolve blocker" tone="danger" />}
          upcoming={<NexopsHomeZoneCard title="Waiting to sync" summary="A future item can stay passive until its trigger arrives." />}
          businessOverview={<NexopsHomeZoneCard title="Business snapshot" summary="High-level counts stay visible without turning into a card pile." dominantLabel="View details" tone="secondary" />}
        />
      </NexopsSectionCard>
    </section>
  );
}
