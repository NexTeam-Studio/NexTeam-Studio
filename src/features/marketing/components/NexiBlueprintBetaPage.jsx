import { useMemo, useState } from "react";
import { getRuntimeConfigValue } from "../../../runtimeConfig.js";

const pageStyles = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top, rgba(79, 70, 229, 0.18), transparent 32%), linear-gradient(180deg, #0A0A14 0%, #111827 100%)",
    color: "#F9FAFB",
    fontFamily: "system-ui, sans-serif",
    padding: "32px 20px 56px"
  },
  shell: {
    maxWidth: "1080px",
    margin: "0 auto"
  },
  brand: {
    color: "#A5B4FC",
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 3,
    textTransform: "uppercase",
    margin: "0 0 18px 0"
  },
  hero: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.2fr) minmax(320px, 0.8fr)",
    gap: 24,
    alignItems: "stretch"
  },
  heroCard: {
    background: "rgba(17, 24, 39, 0.78)",
    border: "1px solid rgba(165, 180, 252, 0.2)",
    borderRadius: 24,
    padding: "32px",
    boxShadow: "0 24px 80px rgba(0, 0, 0, 0.32)",
    backdropFilter: "blur(10px)"
  },
  eyebrow: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderRadius: 999,
    background: "rgba(99, 102, 241, 0.16)",
    color: "#C7D2FE",
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 18
  },
  title: {
    fontSize: "clamp(2.4rem, 5vw, 4.5rem)",
    lineHeight: 1.02,
    margin: "0 0 16px 0",
    letterSpacing: "-0.04em"
  },
  subtitle: {
    color: "#D1D5DB",
    fontSize: 18,
    lineHeight: 1.65,
    margin: "0 0 22px 0",
    maxWidth: 620
  },
  priceRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 14,
    alignItems: "center",
    marginBottom: 22
  },
  pricePill: {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    padding: "10px 16px",
    background: "#F9FAFB",
    color: "#111827",
    fontWeight: 800,
    fontSize: 18
  },
  disclosurePill: {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    padding: "10px 16px",
    background: "rgba(248, 113, 113, 0.14)",
    color: "#FECACA",
    fontWeight: 600,
    fontSize: 14
  },
  buttonRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 14,
    marginBottom: 18
  },
  primaryButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "15px 22px",
    borderRadius: 14,
    background: "linear-gradient(135deg, #6366F1, #3B82F6)",
    color: "#ffffff",
    fontWeight: 700,
    fontSize: 16,
    textDecoration: "none",
    border: "none",
    cursor: "pointer",
    boxShadow: "0 16px 40px rgba(59, 130, 246, 0.25)"
  },
  secondaryButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "15px 22px",
    borderRadius: 14,
    background: "transparent",
    color: "#E5E7EB",
    fontWeight: 700,
    fontSize: 16,
    textDecoration: "none",
    border: "1px solid rgba(229, 231, 235, 0.2)",
    cursor: "pointer"
  },
  disclosure: {
    color: "#9CA3AF",
    fontSize: 14,
    lineHeight: 1.6,
    margin: 0
  },
  sideCard: {
    background: "#F9FAFB",
    color: "#111827",
    borderRadius: 24,
    padding: "28px",
    boxShadow: "0 24px 80px rgba(0, 0, 0, 0.2)"
  },
  sideKicker: {
    color: "#4F46E5",
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 2.5,
    textTransform: "uppercase",
    margin: "0 0 16px 0"
  },
  sideTitle: {
    fontSize: 24,
    margin: "0 0 14px 0"
  },
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "grid",
    gap: 14
  },
  listItem: {
    padding: "14px 16px",
    borderRadius: 16,
    background: "#EEF2FF",
    lineHeight: 1.55
  },
  sectionGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 24,
    marginTop: 24
  },
  sectionCard: {
    background: "rgba(17, 24, 39, 0.8)",
    border: "1px solid rgba(229, 231, 235, 0.1)",
    borderRadius: 24,
    padding: "28px"
  },
  sectionLabel: {
    color: "#A5B4FC",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 2.5,
    textTransform: "uppercase",
    margin: "0 0 14px 0"
  },
  sectionTitle: {
    fontSize: 28,
    margin: "0 0 14px 0"
  },
  bodyText: {
    color: "#D1D5DB",
    lineHeight: 1.7,
    margin: 0
  },
  bulletList: {
    margin: "18px 0 0 0",
    paddingLeft: 20,
    color: "#E5E7EB",
    lineHeight: 1.8
  },
  formSection: {
    marginTop: 24,
    background: "linear-gradient(180deg, rgba(17, 24, 39, 0.95), rgba(15, 23, 42, 0.95))",
    border: "1px solid rgba(99, 102, 241, 0.2)",
    borderRadius: 24,
    padding: "30px"
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 16,
    marginTop: 20
  },
  fieldWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 8
  },
  fullWidth: {
    gridColumn: "1 / -1"
  },
  label: {
    fontSize: 14,
    fontWeight: 600,
    color: "#E5E7EB"
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    borderRadius: 14,
    border: "1px solid rgba(156, 163, 175, 0.25)",
    background: "rgba(255, 255, 255, 0.04)",
    color: "#F9FAFB",
    padding: "14px 16px",
    fontSize: 15
  },
  textarea: {
    minHeight: 130,
    resize: "vertical"
  },
  formNote: {
    color: "#9CA3AF",
    fontSize: 14,
    lineHeight: 1.6,
    margin: "14px 0 0 0"
  },
  inlineError: {
    color: "#FCA5A5",
    fontSize: 14,
    margin: "14px 0 0 0"
  },
  footer: {
    color: "#94A3B8",
    fontSize: 13,
    marginTop: 24,
    textAlign: "center"
  }
};

const mobileStyles = `
  @media (max-width: 860px) {
    .nexi-blueprint-hero,
    .nexi-blueprint-grid,
    .nexi-blueprint-form-grid {
      grid-template-columns: 1fr !important;
    }

    .nexi-blueprint-hero-card,
    .nexi-blueprint-side-card,
    .nexi-blueprint-section-card,
    .nexi-blueprint-form {
      padding: 24px !important;
      border-radius: 20px !important;
    }
  }
`;

const initialForm = {
  name: "",
  email: "",
  business: "",
  website: "",
  bottleneck: ""
};

function buildMailto({ name, email, business, website, bottleneck }) {
  const subject = `Nexi Blueprint Beta request - ${business || name}`;
  const body = [
    "Hi Chris,",
    "",
    "I'd like to request a Nexi Blueprint Beta spot.",
    "",
    `Name: ${name}`,
    `Email: ${email}`,
    `Business: ${business}`,
    `Website: ${website || "N/A"}`,
    "",
    "What's feeling scattered right now:",
    bottleneck
  ].join("\n");

  return `mailto:hello@nexteam.studio?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export default function NexiBlueprintBetaPage() {
  const paymentLink = getRuntimeConfigValue("VITE_NEXI_BLUEPRINT_PAYMENT_LINK", "");
  const hasPaymentLink = paymentLink && paymentLink !== "undefined" && paymentLink !== "#";
  const primaryCtaLabel = hasPaymentLink ? "Claim Beta Access" : "Request Beta Spot";
  const [formValues, setFormValues] = useState(initialForm);
  const [errorMessage, setErrorMessage] = useState("");
  const mailtoHref = useMemo(() => buildMailto(formValues), [formValues]);

  function updateField(event) {
    const { name, value } = event.target;
    setFormValues((current) => ({
      ...current,
      [name]: value
    }));
  }

  function handlePrimaryCta() {
    if (hasPaymentLink) {
      window.open(paymentLink, "_blank", "noopener,noreferrer");
      return;
    }

    document.getElementById("beta-intake-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleSubmit(event) {
    event.preventDefault();

    if (!formValues.name.trim() || !formValues.email.trim() || !formValues.business.trim() || !formValues.bottleneck.trim()) {
      setErrorMessage("Please fill out your name, email, business, and what feels scattered before sending.");
      return;
    }

    setErrorMessage("");
    window.location.href = mailtoHref;
  }

  return (
    <div style={pageStyles.page}>
      <style>{mobileStyles}</style>
      <div style={pageStyles.shell}>
        <p style={pageStyles.brand}>NexTeam-Studio</p>

        <section style={pageStyles.hero} className="nexi-blueprint-hero">
          <div style={pageStyles.heroCard} className="nexi-blueprint-hero-card">
            <div style={pageStyles.eyebrow}>Founder-delivered beta for service business owners</div>
            <h1 style={pageStyles.title}>Get a clear operating blueprint before you buy bigger systems.</h1>
            <p style={pageStyles.subtitle}>
              If your business feels scattered across calls, notes, follow-ups, and half-finished processes, this beta gives
              you a simple map of what should happen, in what order, and where AI can help later.
            </p>

            <div style={pageStyles.priceRow}>
              <div style={pageStyles.pricePill}>$197 beta</div>
              <div style={pageStyles.disclosurePill}>Manual and founder-led. Not live AI software yet.</div>
            </div>

            <div style={pageStyles.buttonRow}>
              <button type="button" style={pageStyles.primaryButton} onClick={handlePrimaryCta}>
                {primaryCtaLabel}
              </button>
              <a href="#beta-intake-form" style={pageStyles.secondaryButton}>
                See the intake
              </a>
            </div>

            <p style={pageStyles.disclosure}>
              Chris from NexTeam-Studio reviews your intake personally, maps the workflow with you, and delivers the first
              version by hand. No fake automation claims, no dashboard access, no "set it and forget it" promise.
            </p>
          </div>

          <aside style={pageStyles.sideCard} className="nexi-blueprint-side-card">
            <p style={pageStyles.sideKicker}>What you get</p>
            <h2 style={pageStyles.sideTitle}>A practical first version of your operating blueprint.</h2>
            <ul style={pageStyles.list}>
              <li style={pageStyles.listItem}>A founder-reviewed intake on where your team is losing clarity right now.</li>
              <li style={pageStyles.listItem}>A simple workflow map covering leads, follow-up, scheduling, and handoffs.</li>
              <li style={pageStyles.listItem}>A prioritized shortlist of what to fix manually first and what could be automated later.</li>
              <li style={pageStyles.listItem}>A plain-English recommendation for the next step if you want NexTeam to build phase two.</li>
            </ul>
          </aside>
        </section>

        <section style={pageStyles.sectionGrid} className="nexi-blueprint-grid">
          <div style={pageStyles.sectionCard} className="nexi-blueprint-section-card">
            <p style={pageStyles.sectionLabel}>The problem</p>
            <h2 style={pageStyles.sectionTitle}>Scattered operations create expensive confusion.</h2>
            <p style={pageStyles.bodyText}>
              Most owners do not need more software first. They need one clear picture of how work should move from inquiry
              to completed job, who owns each step, and where the real bottlenecks are.
            </p>
          </div>

          <div style={pageStyles.sectionCard} className="nexi-blueprint-section-card">
            <p style={pageStyles.sectionLabel}>What this beta is</p>
            <h2 style={pageStyles.sectionTitle}>A manual service to validate the path.</h2>
            <p style={pageStyles.bodyText}>
              This beta is intentionally simple. You are paying for clarity and a custom operating blueprint, not for live AI,
              not for a chatbot, and not for a finished automation stack.
            </p>
          </div>
        </section>

        <section id="beta-intake-form" style={pageStyles.formSection} className="nexi-blueprint-form">
          <p style={pageStyles.sectionLabel}>Request a beta spot</p>
          <h2 style={{ ...pageStyles.sectionTitle, marginBottom: 10 }}>Send a short intake and I&apos;ll review it personally.</h2>
          <p style={pageStyles.bodyText}>
            If a payment link is ready, I&apos;ll send it after confirming the fit. If not, this request simply starts the conversation.
          </p>

          <form onSubmit={handleSubmit}>
            <div style={pageStyles.formGrid} className="nexi-blueprint-form-grid">
              <div style={pageStyles.fieldWrap}>
                <label htmlFor="name" style={pageStyles.label}>
                  Name
                </label>
                <input id="name" name="name" type="text" value={formValues.name} onChange={updateField} style={pageStyles.input} />
              </div>

              <div style={pageStyles.fieldWrap}>
                <label htmlFor="email" style={pageStyles.label}>
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={formValues.email}
                  onChange={updateField}
                  style={pageStyles.input}
                />
              </div>

              <div style={pageStyles.fieldWrap}>
                <label htmlFor="business" style={pageStyles.label}>
                  Business
                </label>
                <input
                  id="business"
                  name="business"
                  type="text"
                  value={formValues.business}
                  onChange={updateField}
                  style={pageStyles.input}
                />
              </div>

              <div style={pageStyles.fieldWrap}>
                <label htmlFor="website" style={pageStyles.label}>
                  Website or Instagram
                </label>
                <input
                  id="website"
                  name="website"
                  type="text"
                  value={formValues.website}
                  onChange={updateField}
                  style={pageStyles.input}
                />
              </div>

              <div style={{ ...pageStyles.fieldWrap, ...pageStyles.fullWidth }}>
                <label htmlFor="bottleneck" style={pageStyles.label}>
                  What feels most scattered right now?
                </label>
                <textarea
                  id="bottleneck"
                  name="bottleneck"
                  value={formValues.bottleneck}
                  onChange={updateField}
                  style={{ ...pageStyles.input, ...pageStyles.textarea }}
                />
              </div>
            </div>

            {errorMessage ? <p style={pageStyles.inlineError}>{errorMessage}</p> : null}

            <div style={{ ...pageStyles.buttonRow, marginTop: 20, marginBottom: 0 }}>
              <button type="submit" style={pageStyles.primaryButton}>
                Request Beta Spot
              </button>
              <a href={mailtoHref} style={pageStyles.secondaryButton}>
                Email instead
              </a>
            </div>
          </form>

          <p style={pageStyles.formNote}>
            Contact fallback: <a href="mailto:hello@nexteam.studio" style={{ color: "#C7D2FE" }}>hello@nexteam.studio</a>
          </p>
        </section>

        <p style={pageStyles.footer}>Draft beta page for the current revenue sprint.</p>
      </div>
    </div>
  );
}
