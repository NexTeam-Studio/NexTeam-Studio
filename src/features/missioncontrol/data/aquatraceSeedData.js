/**
 * Aquatrace case-study seed data.
 * Used as fallback when Firestore is unavailable or collection is empty.
 * Schema-compliant with sopSchema, blueprintSchema, onboardingSchema.
 */

import { SOP_STATES } from "../schemas/sopSchema";
import { BLUEPRINT_STATES } from "../schemas/blueprintSchema";
import { ONBOARDING_TASK_STATES, ONBOARDING_SESSION_STATES } from "../schemas/onboardingSchema";

// ──────────────────────────────────────────────────
// SEED SOPs
// ──────────────────────────────────────────────────

export const SEED_SOPS = [
  {
    id: "sop-aquatrace-001",
    title: "New Customer Intake",
    description:
      "Capture new customer requests from any channel. Log the job type, validate contact info, and get it into the queue fast.",
    category: "intake",
    state: SOP_STATES.APPROVED,
    version: 1,
    revisionHistory: [],
    steps: [
      {
        stepNumber: 1,
        title: "Capture contact details",
        description: "Name, phone, email, property address, service requested.",
        assignedAgent: "Heimdall",
        estimatedMinutes: 2
      },
      {
        stepNumber: 2,
        title: "Validate and deduplicate",
        description: "Check CRM for existing record. Merge if duplicate found.",
        assignedAgent: "Heimdall",
        estimatedMinutes: 1
      },
      {
        stepNumber: 3,
        title: "Log service type",
        description: "Tag as: inspection, installation, repair, emergency.",
        assignedAgent: "Heimdall",
        estimatedMinutes: 1
      },
      {
        stepNumber: 4,
        title: "Route to scheduling queue",
        description: "Hand off to scheduler. Set urgency flag if emergency.",
        assignedAgent: "Thor",
        estimatedMinutes: 1
      }
    ],
    tags: ["intake", "customer", "routing"],
    linkedBlueprints: ["blueprint-aquatrace-001"],
    linkedOnboardingTasks: [],
    createdBy: "atlas",
    createdAt: "2026-04-01T00:00:00Z",
    updatedAt: "2026-04-01T00:00:00Z",
    publishedAt: "2026-04-01T00:00:00Z",
    approvedBy: "clawdia",
    aiDraftPath: false,
    humanReadablePreview: null
  },
  {
    id: "sop-aquatrace-002",
    title: "Post-Service Follow-Up",
    description:
      "After a job is done, automatically follow up within 24 hours to confirm the customer is happy and ask for a review.",
    category: "follow-up",
    state: SOP_STATES.APPROVED,
    version: 2,
    revisionHistory: [
      {
        version: 1,
        updatedAt: "2026-03-15T00:00:00Z",
        updatedBy: "atlas",
        note: "Initial version"
      }
    ],
    steps: [
      {
        stepNumber: 1,
        title: "Detect job completion",
        description: "Monitor job status field for 'completed' state.",
        assignedAgent: "Freyja",
        estimatedMinutes: 0
      },
      {
        stepNumber: 2,
        title: "Send satisfaction message",
        description: "Text or email customer. Include technician name and job reference.",
        assignedAgent: "Thor",
        estimatedMinutes: 1
      },
      {
        stepNumber: 3,
        title: "Log follow-up event",
        description: "Record send timestamp and channel used.",
        assignedAgent: "Mimir",
        estimatedMinutes: 1
      },
      {
        stepNumber: 4,
        title: "Monitor for review",
        description: "If review submitted within 72 hours, log and close. If not, flag for second follow-up.",
        assignedAgent: "Freyja",
        estimatedMinutes: 0
      }
    ],
    tags: ["follow-up", "satisfaction", "review"],
    linkedBlueprints: ["blueprint-aquatrace-001"],
    linkedOnboardingTasks: ["task-onboard-04"],
    createdBy: "atlas",
    createdAt: "2026-03-15T00:00:00Z",
    updatedAt: "2026-04-01T00:00:00Z",
    publishedAt: "2026-04-01T00:00:00Z",
    approvedBy: "clawdia",
    aiDraftPath: false,
    humanReadablePreview: null
  },
  {
    id: "sop-aquatrace-003",
    title: "Emergency Service Escalation",
    description:
      "When a customer reports a water emergency, trigger an immediate response — technician alerted within minutes, customer updated right away.",
    category: "escalation",
    state: SOP_STATES.APPROVED,
    version: 1,
    revisionHistory: [],
    steps: [
      {
        stepNumber: 1,
        title: "Classify as emergency",
        description: "Keywords: burst, flooding, leak, contamination, no water. Auto-flag if found.",
        assignedAgent: "Heimdall",
        estimatedMinutes: 0
      },
      {
        stepNumber: 2,
        title: "Acknowledge immediately",
        description: "Reply within 60 seconds. Set expectation for callback within 15 minutes.",
        assignedAgent: "Thor",
        estimatedMinutes: 1
      },
      {
        stepNumber: 3,
        title: "Alert on-call technician",
        description: "Notify on-call via SMS and push. Include customer name, address, issue summary.",
        assignedAgent: "Thor",
        estimatedMinutes: 1
      },
      {
        stepNumber: 4,
        title: "Track response",
        description: "Log technician acknowledgment. If no response in 5 min, escalate to owner.",
        assignedAgent: "Mimir",
        estimatedMinutes: 5
      }
    ],
    tags: ["emergency", "escalation", "urgent"],
    linkedBlueprints: ["blueprint-aquatrace-001"],
    linkedOnboardingTasks: [],
    createdBy: "atlas",
    createdAt: "2026-04-01T00:00:00Z",
    updatedAt: "2026-04-01T00:00:00Z",
    publishedAt: "2026-04-01T00:00:00Z",
    approvedBy: "clawdia",
    aiDraftPath: false,
    humanReadablePreview: null
  },
  {
    id: "sop-aquatrace-004",
    title: "Monthly Campaign — Seasonal Inspection Reminder",
    description:
      "Send a targeted message to your customer list for seasonal inspections. Njord drafts it, you review and approve before anything sends.",
    category: "campaign",
    state: SOP_STATES.REVIEW,
    version: 1,
    revisionHistory: [],
    steps: [
      {
        stepNumber: 1,
        title: "Draft message",
        description: "Bragi drafts subject line and body. Include seasonal hook (spring pipe check, winter freeze prep).",
        assignedAgent: "Bragi",
        estimatedMinutes: 10
      },
      {
        stepNumber: 2,
        title: "Send test email",
        description: "Send to configured test address. Confirm rendering and links.",
        assignedAgent: "Thor",
        estimatedMinutes: 5
      },
      {
        stepNumber: 3,
        title: "First approval",
        description: "Operator reviews test email and approves (Confirmation #1).",
        assignedAgent: null,
        estimatedMinutes: null,
        gatingCondition: "test-email-confirmed"
      },
      {
        stepNumber: 4,
        title: "Final approval",
        description: "Owner or second operator issues final send approval (Confirmation #2).",
        assignedAgent: null,
        estimatedMinutes: null,
        gatingCondition: "approval-count-gte-1"
      },
      {
        stepNumber: 5,
        title: "Execute send",
        description: "Thor delivers campaign. Full-list send is sandbox/log-only in case-study mode.",
        assignedAgent: "Thor",
        estimatedMinutes: 2
      }
    ],
    tags: ["campaign", "seasonal", "email", "two-step-approval"],
    linkedBlueprints: ["blueprint-aquatrace-001"],
    linkedOnboardingTasks: [],
    createdBy: "atlas",
    createdAt: "2026-04-10T00:00:00Z",
    updatedAt: "2026-04-10T00:00:00Z",
    publishedAt: null,
    approvedBy: null,
    aiDraftPath: false,
    humanReadablePreview: null
  },
  {
    id: "sop-aquatrace-005",
    title: "Lead Capture — Web Form Response",
    description:
      "When someone fills out your web form, respond within 5 minutes. Qualify the lead, log it, and route to the right next step.",
    category: "intake",
    state: SOP_STATES.DRAFT,
    version: 1,
    revisionHistory: [],
    steps: [
      {
        stepNumber: 1,
        title: "Detect web form submission",
        description: "Trigger on form webhook or Zapier event.",
        assignedAgent: "Heimdall",
        estimatedMinutes: 0
      },
      {
        stepNumber: 2,
        title: "Send instant acknowledgment",
        description: "Reply to lead email/text within 5 minutes confirming receipt.",
        assignedAgent: "Thor",
        estimatedMinutes: 1
      },
      {
        stepNumber: 3,
        title: "Qualify lead",
        description: "Check: service area, service type, urgency, budget range.",
        assignedAgent: "Heimdall",
        estimatedMinutes: 2
      },
      {
        stepNumber: 4,
        title: "Log to CRM and route",
        description: "Create or update CRM record. Route to follow-up or scheduling queue.",
        assignedAgent: "Mimir",
        estimatedMinutes: 1
      }
    ],
    tags: ["lead", "intake", "web-form"],
    linkedBlueprints: ["blueprint-aquatrace-001"],
    linkedOnboardingTasks: [],
    createdBy: "atlas",
    createdAt: "2026-04-10T00:00:00Z",
    updatedAt: "2026-04-10T00:00:00Z",
    publishedAt: null,
    approvedBy: null,
    aiDraftPath: true,
    humanReadablePreview: null
  }
];

// ──────────────────────────────────────────────────
// SEED BLUEPRINT
// ──────────────────────────────────────────────────

export const SEED_ONBOARDING_SESSIONS = [
  {
    id: "onboard-aquatrace-001",
    clientId: "aquatrace",
    clientName: "Aquatrace Water Services",
    blueprintId: "blueprint-aquatrace-001",
    blueprintName: "Aquatrace Standard Operations",
    state: ONBOARDING_SESSION_STATES.ACTIVE,
    startedAt: "2026-04-10T00:00:00Z",
    completedAt: null,
    assignedTo: "operator",
    notes: "Case-study onboarding session for Aquatrace reference client.",
    createdAt: "2026-04-10T00:00:00Z",
    updatedAt: "2026-04-10T00:00:00Z",
    tasks: [
      { taskId: "task-onboard-01", title: "Configure business profile", state: ONBOARDING_TASK_STATES.COMPLETE, completedAt: "2026-04-10T01:00:00Z", completedBy: "operator" },
      { taskId: "task-onboard-02", title: "Set up intake channels", state: ONBOARDING_TASK_STATES.IN_PROGRESS },
      { taskId: "task-onboard-03", title: "Configure test email address", state: ONBOARDING_TASK_STATES.NOT_STARTED },
      { taskId: "task-onboard-04", title: "Activate post-service follow-up SOP", state: ONBOARDING_TASK_STATES.NOT_STARTED },
      { taskId: "task-onboard-05", title: "Review emergency escalation SOP", state: ONBOARDING_TASK_STATES.NOT_STARTED },
      { taskId: "task-onboard-06", title: "Run first Njord chat session", state: ONBOARDING_TASK_STATES.NOT_STARTED },
      { taskId: "task-onboard-07", title: "Approve go-live", state: ONBOARDING_TASK_STATES.NOT_STARTED }
    ]
  }
];
export const SEED_BLUEPRINTS = [
  {
    id: "blueprint-aquatrace-001",
    name: "Water Services — Standard Field Ops",
    trade: "water-services",
    industry: "field-service",
    description:
      "The complete Aquatrace operations setup. Covers lead intake, job follow-up, emergency escalation, and customer campaigns. Use this to get your full AI operations team running.",
    state: BLUEPRINT_STATES.ACTIVE,
    version: 1,
    linkedSOPs: [
      "sop-aquatrace-001",
      "sop-aquatrace-002",
      "sop-aquatrace-003",
      "sop-aquatrace-004",
      "sop-aquatrace-005"
    ],
    agentRoster: [
      {
        agentId: "njord",
        agentName: "Njord",
        role: "Host Agent / Coordinator",
        purpose: "Routes all requests to the right Norse specialist agent."
      },
      {
        agentId: "heimdall",
        agentName: "Heimdall",
        role: "Gatekeeper & Intake",
        purpose: "Handles new inbound leads, validation, and routing."
      },
      {
        agentId: "thor",
        agentName: "Thor",
        role: "Outreach & Campaign Execution",
        purpose: "Sends confirmation texts, follow-ups, and campaign emails."
      },
      {
        agentId: "mimir",
        agentName: "Mimir",
        role: "Knowledge & Research",
        purpose: "Surfaces customer history, job context, and research."
      },
      {
        agentId: "freyja",
        agentName: "Freyja",
        role: "Relationships & Engagement",
        purpose: "Tracks sentiment, satisfaction, and nurture cadence."
      },
      {
        agentId: "bragi",
        agentName: "Bragi",
        role: "Content & Messaging",
        purpose: "Writes email copy, subject lines, and message templates."
      }
    ],
    onboardingTasks: [
      {
        taskId: "task-onboard-01",
        title: "Configure business profile",
        description: "Add company name, address, phone, primary contact, and service area.",
        sopId: null,
        sopTitle: null,
        assignedRole: "operator",
        estimatedMinutes: 15,
        order: 1
      },
      {
        taskId: "task-onboard-02",
        title: "Set up intake channels",
        description: "Connect web form webhook and phone/text inbox to Heimdall.",
        sopId: "sop-aquatrace-001",
        sopTitle: "New Customer Intake",
        assignedRole: "operator",
        estimatedMinutes: 30,
        order: 2
      },
      {
        taskId: "task-onboard-03",
        title: "Configure test email address",
        description: "Set VITE_NJORD_TEST_EMAIL in environment. Confirm test delivery.",
        sopId: null,
        sopTitle: null,
        assignedRole: "operator",
        estimatedMinutes: 10,
        order: 3
      },
      {
        taskId: "task-onboard-04",
        title: "Activate post-service follow-up SOP",
        description: "Enable post-job follow-up automation. Review trigger conditions.",
        sopId: "sop-aquatrace-002",
        sopTitle: "Post-Service Follow-Up",
        assignedRole: "operator",
        estimatedMinutes: 20,
        order: 4
      },
      {
        taskId: "task-onboard-05",
        title: "Review emergency escalation SOP",
        description: "Confirm on-call contact and escalation path with client.",
        sopId: "sop-aquatrace-003",
        sopTitle: "Emergency Service Escalation",
        assignedRole: "operator",
        estimatedMinutes: 20,
        order: 5
      },
      {
        taskId: "task-onboard-06",
        title: "Run first Njord chat session",
        description: "Open Mission Control, send a test message, verify routing and logging.",
        sopId: null,
        sopTitle: null,
        assignedRole: "operator",
        estimatedMinutes: 15,
        order: 6
      },
      {
        taskId: "task-onboard-07",
        title: "Approve go-live",
        description: "Client and operator sign off on readiness. Activate full-ops mode.",
        sopId: null,
        sopTitle: null,
        assignedRole: "owner",
        estimatedMinutes: 30,
        order: 7
      }
    ],
    requiredIntegrations: ["resend", "firestore", "anthropic-claude"],
    estimatedOnboardDays: 5,
    tags: ["water", "field-service", "njord", "standard"],
    createdBy: "atlas",
    createdAt: "2026-04-01T00:00:00Z",
    updatedAt: "2026-04-10T00:00:00Z"
  }
];
