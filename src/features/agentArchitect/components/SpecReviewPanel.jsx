import { useState } from "react";
import {
  buildStripeRedirectUrl,
  createBlueprintRequest,
  markBlueprintCheckoutStarted,
} from "../services/blueprintRequestClient.js";
import { getRuntimeConfigValue } from "../../../runtimeConfig.js";

const reviewStyles = {
  card: {
    width: "100%",
    maxWidth: "900px",
    background: "#ffffff",
    borderRadius: "20px",
    boxShadow: "0 20px 40px rgba(15, 23, 42, 0.12)",
    padding: "32px",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  eyebrow: {
    color: "#4F46E5",
    fontSize: "14px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    margin: 0,
  },
  title: {
    margin: 0,
    fontSize: "36px",
    color: "#111827",
  },
  section: {
    border: "1px solid #E5E7EB",
    borderRadius: "16px",
    padding: "20px",
    background: "#F9FAFB",
  },
  sectionTitle: {
    margin: "0 0 12px 0",
    color: "#4F46E5",
    fontSize: "18px",
  },
  text: {
    margin: 0,
    color: "#374151",
    lineHeight: 1.6,
  },
  badgeRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
  },
  badge: {
    background: "#EEF2FF",
    color: "#4338CA",
    borderRadius: "999px",
    padding: "8px 14px",
    fontSize: "14px",
    fontWeight: 600,
  },
  priority: {
    display: "inline-block",
    background: "#4F46E5",
    color: "#ffffff",
    borderRadius: "999px",
    padding: "10px 16px",
    fontSize: "16px",
    fontWeight: 700,
  },
  actions: {
    display: "flex",
    gap: "12px",
    marginTop: "8px",
    flexWrap: "wrap",
  },
  primaryButton: {
    border: "none",
    background: "#4F46E5",
    color: "#ffffff",
    borderRadius: "12px",
    padding: "12px 18px",
    fontWeight: 700,
    cursor: "pointer",
  },
  secondaryButton: {
    border: "1px solid #D1D5DB",
    background: "#ffffff",
    color: "#111827",
    borderRadius: "12px",
    padding: "12px 18px",
    fontWeight: 600,
    cursor: "pointer",
  },
  error: {
    margin: 0,
    color: "#B91C1C",
    fontSize: "14px",
    lineHeight: 1.6,
  },
  note: {
    margin: 0,
    color: "#6B7280",
    fontSize: "13px",
    lineHeight: 1.6,
  },
};

function formatAgentLabel(value) {
  return String(value || "")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function SpecReviewPanel({ agentSpec, sessionId = "", agentId = "" }) {
  const {
    businessName,
    trade,
    serviceArea,
    agentMission,
    recommendedAgents = [],
    priorityAgent,
    agentName,
  } = agentSpec || {};

  const safeBusinessName = businessName || "Your Business";
  const safeTrade = trade || "field service";
  const safeAgentMission =
    agentMission ||
    "Your custom agent will be configured around your exact workflow and team needs.";
  const safeRecommendedAgents = Array.isArray(recommendedAgents) ? recommendedAgents.filter(Boolean) : [];
  const hasPriorityAgent = priorityAgent && priorityAgent !== "not_selected";
  const safeAgentName = agentName || "Your Nexi Agent";
  const paymentLink =
    getRuntimeConfigValue("VITE_NEXI_BLUEPRINT_PAYMENT_LINK") || getRuntimeConfigValue("VITE_STRIPE_PAYMENT_LINK");
  const hasPaymentLink = paymentLink && paymentLink !== "undefined";
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const businessSummaryParts = [safeBusinessName, "is a", safeTrade, "business"];
  if (serviceArea) businessSummaryParts.push("serving", serviceArea);
  const businessSummary = businessSummaryParts.join(" ") + ".";

  async function handleContinueToSetup() {
    if (!hasPaymentLink) {
      return;
    }

    try {
      setIsSubmitting(true);
      setSubmitError("");

      const request = await createBlueprintRequest({
        sessionId,
        agentId,
        tenantId: "nexteam-studio",
        businessName: safeBusinessName,
        trade: safeTrade,
        serviceArea,
        agentName: safeAgentName,
        priorityAgent,
        recommendedAgents: safeRecommendedAgents,
        source: "agent-architect-review",
      });

      await markBlueprintCheckoutStarted(request.requestId, {
        source: "spec-review-panel",
        sessionId,
        businessName: safeBusinessName,
      });

      const appUrl = getRuntimeConfigValue("VITE_APP_URL", window.location.origin);
      window.location.href = buildStripeRedirectUrl({
        paymentLink,
        appUrl,
        requestId: request.requestId,
        sessionId,
        tenantId: "nexteam-studio",
      });
    } catch (error) {
      setSubmitError(String(error?.message || "Could not start the blueprint checkout flow."));
      setIsSubmitting(false);
    }
  }

  return (
    <div style={reviewStyles.card}>
      <p style={reviewStyles.eyebrow}>Your Blueprint is Ready</p>
      <h1 style={reviewStyles.title}>{safeAgentName}</h1>

      <section style={reviewStyles.section}>
        <h2 style={reviewStyles.sectionTitle}>Business overview</h2>
        <p style={reviewStyles.text}>{businessSummary}</p>
      </section>

      <section style={reviewStyles.section}>
        <h2 style={reviewStyles.sectionTitle}>What your agent will do</h2>
        <p style={reviewStyles.text}>{safeAgentMission}</p>
      </section>

      {safeRecommendedAgents.length ? (
        <section style={reviewStyles.section}>
          <h2 style={reviewStyles.sectionTitle}>Recommended agents</h2>
          <div style={reviewStyles.badgeRow}>
            {safeRecommendedAgents.map((agent) => (
              <span key={agent} style={reviewStyles.badge}>
                {formatAgentLabel(agent)}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {hasPriorityAgent ? (
        <section style={reviewStyles.section}>
          <h2 style={reviewStyles.sectionTitle}>Where we start</h2>
          <span style={reviewStyles.priority}>{formatAgentLabel(priorityAgent)}</span>
        </section>
      ) : null}

      <div style={reviewStyles.actions}>
        {hasPaymentLink ? (
          <button
            type="button"
            style={reviewStyles.primaryButton}
            onClick={() => void handleContinueToSetup()}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Preparing checkout..." : "Continue to Setup - $197"}
          </button>
        ) : (
          <button
            type="button"
            style={reviewStyles.primaryButton}
            onClick={() => {
              window.alert("Thanks - your blueprint is ready. Our team will follow up with the next step for your agent setup.");
            }}
          >
            See Next Step
          </button>
        )}
        <button type="button" style={reviewStyles.secondaryButton} onClick={() => window.location.reload()}>
          Start Over
        </button>
      </div>

      {submitError ? <p style={reviewStyles.error}>{submitError}</p> : null}
      {hasPaymentLink ? (
        <p style={reviewStyles.note}>
          This founder-led beta records the blueprint request first, then opens the Stripe payment link.
        </p>
      ) : null}
    </div>
  );
}
