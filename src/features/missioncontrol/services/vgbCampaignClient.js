export const VGB_STORAGE_KEY = "aquatrace.vgbCampaign";

export const DEFAULT_VGB_EMAIL_TEMPLATE = {
  subject: "Pool Safety Documentation — Federal Compliance Notice for [Property Name]",
  body: `Hi [First Name],

My name is Chris Sears — I'm the owner and founder of Aquatrace Swimming Pool Leak Detection, based in Fair Play, South Carolina. I want to bring something to your attention that affects every commercial pool operator in the country, and that most facility managers I speak with haven't fully addressed yet.

The Virginia Graeme Baker Pool and Spa Safety Act is federal law. It requires that all public and commercial pools have properly sized, ASME/ANSI A112.19.8 listed drain covers installed and maintained. That part most operators know. What most operators don't know is that compliance with the VGB Act isn't just about having the right covers installed — it's about being able to document that you have them, what they are, their condition, and whether they're appropriate for the system they're installed on.

VGB-compliant drain covers carry a manufacturer service life. Covers crack, warp, fade, and fall off the CPSC approved products list. When that happens, they require replacement. Replacement requires precise sump measurements to confirm correct sizing, proper installation by a licensed contractor, and documentation. If your facility cannot produce that documentation when an inspector asks, when a permit comes up, when an insurance carrier requests it, or when something worse happens — you are operating with an undocumented exposure.

Here is something that surprises a lot of operators: the original pool approval from your local authority having jurisdiction may not reflect current VGB requirements. Standards have changed since the Act's passage, and what was approved under an older permit cycle may not fully satisfy current requirements. That's not your fault. But it is your responsibility to know where you stand.

The legal reality is straightforward. When something goes wrong at a commercial pool and documentation is absent, that absence itself becomes the liability. Both documented negligence and complete absence of documentation are actionable. Insurance carriers for commercial facilities increasingly require proof of drain cover compliance as a condition of coverage.

And here's something most operators don't expect — we go in the water.

Our technicians are certified scuba divers. We conduct our inspections underwater with the pool fully filled and operational. No draining. No downtime. No disruption to your guests. We then deliver a clean, organized report directly to you. What you do with that report — whether you share it with your pool contractor, your insurance carrier, your permit inspector, or your legal counsel — is entirely in your hands. We provide you with the documented measurements and photos that paint the factual picture of what is currently installed at your pool, so that you and your qualified professionals can make informed decisions about your equipment and your exposure. That's not something you want to be piecing together after the fact.

Jurisdictions like Buncombe County, North Carolina are already requiring this type of documentation packet as a condition of annual pool operating permits. The regulatory direction across the Southeast is moving the same way.

This isn't a sales pitch — it's a heads-up that this is an area most operators haven't addressed, and the cost of getting it documented now is a fraction of what it costs to deal with it after an inspection flags a problem or something worse happens.

Now let's change lanes for a second so I can toss you a sales pitch!

Aquatrace is also the region's specialist in swimming pool and spa leak detection. If your pool operator is regularly adding water to the pool, that water isn't evaporating — it's going somewhere. A leaking pool doesn't just waste water. It throws off chemical balance, drives up treatment costs, and left unaddressed, can cause serious structural damage to the surrounding area. We locate the source precisely, so repairs are targeted and cost-effective rather than exploratory and expensive.

Both services are non-invasive, and a site visit is a straightforward process we can work around your schedule to complete. For operators who can't afford any downtime, we're happy to discuss after-hours scheduling for either service before any commitment is made — your pool stays open and your guests never know we were there.

If you'd like to learn more or set something up, feel free to reach out directly.

One last thing — these requirements touch anyone who operates a pool accessible to the public or to residents. If you have colleagues, peers, or contacts who manage multiple properties or oversee facilities with pools, they need to know about this too. We are happy to extend the same conversation to anyone you feel would benefit.

Chris
Owner & Founder, Aquatrace Swimming Pool Leak Detection
service@aquatraceleak.com
aquatraceleak.com
(864) 710-8636
(888) 896-AQUA`,
};

export const DEFAULT_SUPPORTING_SCRIPTS = {
  frontDeskPhoneScript: "Hi, my name is Chris with Aquatrace Swimming Pool Leak Detection. I need to get some federal pool safety information over to your general manager — what’s the best email address I can send this over to?",
  hoaContactFormShort: "Aquatrace Swimming Pool Leak Detection — Fair Play, SC. Federal VGB Act main drain requirements can shut your pool down without warning. This is a real concern and I’d like to discuss it with you personally. (864) 710-8636 | service@aquatraceleak.com",
  legalDisclaimer: "Aquatrace documents measurements and photos that show the factual picture of what is installed. Aquatrace does not verify regulatory compliance. Compliance determination belongs to the operator’s qualified professionals, including licensed contractors, engineers, code officials, and legal or insurance advisors.",
};

export const DEFAULT_CONTACTS = [
  {
    id: "vgb-contact-1",
    firstName: "Chris",
    lastName: "Sears",
    propertyName: "Aquatrace Test Contact",
    email: "chris@aquatraceleak.com",
    segment: "Hotel / Resort",
    state: "SC",
    zone: "Zone 1",
    status: "Ready",
    sendState: { sent: false, opened: false, replied: false, booked: false, sentAt: null, followUpDueAt: null, lastMessageId: null },
    followUpNeeded: false,
    notes: "Controlled live-send test contact.",
  }
];

export function defaultCampaignState() {
  return {
    campaignName: "Aquatrace VGB Cold Outreach",
    objective: "Book VGB main drain cover documentation visits.",
    activeStage: "Build list → Send outreach → Track replies",
    geography: ["SC", "NC", "GA", "TN", "VA", "FL"],
    contacts: DEFAULT_CONTACTS,
    template: DEFAULT_VGB_EMAIL_TEMPLATE,
    scripts: DEFAULT_SUPPORTING_SCRIPTS,
    activity: [],
    lastUpdatedAt: new Date().toISOString(),
  };
}

export function readVgbCampaignState() {
  try {
    const raw = window.localStorage.getItem(VGB_STORAGE_KEY);
    if (!raw) return defaultCampaignState();
    return { ...defaultCampaignState(), ...JSON.parse(raw) };
  } catch {
    return defaultCampaignState();
  }
}

export function saveVgbCampaignState(nextState) {
  const state = { ...nextState, lastUpdatedAt: new Date().toISOString() };
  window.localStorage.setItem(VGB_STORAGE_KEY, JSON.stringify(state));
  return state;
}

export function mergeFields(template, contact) {
  return template
    .replaceAll("[First Name]", contact.firstName || "there")
    .replaceAll("[Property Name]", contact.propertyName || "your property");
}

export function buildContactEmailPreview(contact, template) {
  return {
    subject: mergeFields(template.subject, contact),
    body: mergeFields(template.body, contact),
  };
}

export async function sendVgbEmail(contact, template) {
  const message = buildContactEmailPreview(contact, template);
  const response = await fetch("/api/vgb/send-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contactId: contact.id,
      toAddress: contact.email,
      subject: message.subject,
      body: message.body,
      propertyName: contact.propertyName,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || `Could not send email (${response.status})`);
  }
  return data;
}

export function summarizeCampaign(state) {
  const total = state.contacts.length;
  const sent = state.contacts.filter((c) => c.sendState?.sent).length;
  const opened = state.contacts.filter((c) => c.sendState?.opened).length;
  const replied = state.contacts.filter((c) => c.sendState?.replied).length;
  const booked = state.contacts.filter((c) => c.sendState?.booked).length;
  const followUps = state.contacts.filter((c) => c.followUpNeeded).length;
  return { total, sent, opened, replied, booked, followUps };
}
