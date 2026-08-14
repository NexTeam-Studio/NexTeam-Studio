import React from "react";
import { formatAddress } from "@nexteam/shared";
import "./clientDetails.css";
import { NexDocsClientWorkspace } from "../../../nexdocs/areas/clientWorkspace/components/NexDocsClientWorkspace";
import { CLIENT_PROFILE_TABS, type ClientProfileTab, type NexOpsModule } from "../../../nexopsShell/domain/nexopsNavigation";
import { nexiMapsHref } from "../../../nexi/areas/chat/components/NexiStandalonePrimitives";
import {
  CLIENT_CUSTOM_FIELD_RESERVED_LABELS,
  CLIENT_PROFILE_MOBILE_BUCKET_LABELS,
  PROPERTY_CUSTOM_FIELD_RESERVED_LABELS,
  createCustomFieldDraftRow,
  mobileBucketForClientTab,
  mobileTabsForBucket,
  visibleCustomFields,
  type ClientProfileMobileBucket,
  type CustomFieldDraftRow
} from "../contact/domain/clientProfile";
import { isProtectedLegacyClient } from "./domain/clientDeletionPolicy";
import { buildClientRelationshipHistory } from "./domain/clientRelationshipHistory";
import { PropertyAssetsManager } from "./PropertyAssetsManager";
import type {
  ClientPortalActivityEntry,
  CrmClient,
  CrmContact,
  CrmInvoice,
  CrmJob,
  CrmPaymentSummary,
  CrmPhone,
  CrmProperty,
  CrmQuote,
  CrmReceiptReviewSummary,
  CrmRequestSummary,
  FieldDocsMediaRecord,
  OperatorContext,
  ReviewSequenceRecord,
  SignedDocumentRecord,
  WorkspaceTarget
} from "../../../nexopsShell/NexOpsWorkspace";

export interface ClientDetailsBindings {
  activeClientProfileTab: ClientProfileTab;
  clientContactDisplayName: (client: CrmClient, primaryContact?: CrmContact) => string;
  clientDisplayName: (client: CrmClient) => string;
  clientFieldMedia: FieldDocsMediaRecord[];
  clientFieldReports: Array<{ id: string; title: string; pdfRef: string; status: string; jobId: string; propertyId?: string; visitId?: string; kind?: "field_report" | "ai_recap"; templateId?: string; snippetIds?: string[]; watermarkEnabled?: boolean; createdAt?: string; postedAt?: string }>;
  clientOverviewCustomFieldValidation: { duplicateLabels: string[]; reservedConflicts: string[]; hasBlockingIssues: boolean };
  clientOverviewCustomFieldsDraft: CustomFieldDraftRow[];
  clientOverviewCustomFieldsOpen: boolean;
  clientPortalActivity: ClientPortalActivityEntry[];
  clientPrimaryAddress: (client: CrmClient) => string;
  clientRailBusy: string;
  clientRailStatus: string;
  clientReviewSequences: ReviewSequenceRecord[];
  clientSignedDocuments: SignedDocumentRecord[];
  clientStatusLabel: (client: CrmClient) => string;
  deleteClientRecord: (clientId: string) => Promise<void>;
  formatPhoneDisplay: (phone: string) => string;
  lastPortalLink: string;
  mobileClientExpandedBucket: ClientProfileMobileBucket | null;
  mobileClientViewport: boolean;
  MobileClientEditGlyph: () => React.ReactElement;
  MobileClientSummaryGlyph: (props: { kind: "phone" | "email" | "directions" }) => React.ReactElement;
  openCreateClientDrawer: (surface?: "client" | "contact" | "property") => void;
  openEditClientWorkspace: () => void;
  openWorkspaceTarget: (target: WorkspaceTarget) => void;
  operatorContext: OperatorContext;
  orderedClientFieldMedia: Array<FieldDocsMediaRecord & { score?: number; matched?: string[] }>;
  personDisplayName: (person?: { firstName?: string; lastName?: string }) => string;
  returnToClientRoster: () => void;
  saveClientMarketingConsent: (clientId: string, marketing: boolean) => Promise<void>;
  saveClientOverviewCustomFields: (clientId: string) => Promise<void>;
  selectedClient: CrmClient | null;
  selectedContact: CrmContact | undefined;
  selectedEmail: string | undefined;
  selectedInvoices: CrmInvoice[];
  selectedJobs: CrmJob[];
  selectedPayments: CrmPaymentSummary[];
  selectedPhone: CrmPhone | undefined;
  selectedPhoneValue: string;
  selectedProperties: CrmProperty[];
  selectedQuotes: CrmQuote[];
  selectedReceiptReviewSummaries: CrmReceiptReviewSummary[];
  selectedRequests: CrmRequestSummary[];
  sendClientPortalLink: (clientId: string, propertyId?: string) => Promise<void>;
  sendClientStatement: (clientId: string) => Promise<void>;
  setClientOverviewCustomFieldsDraft: React.Dispatch<React.SetStateAction<CustomFieldDraftRow[]>>;
  setClientOverviewCustomFieldsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setClientProfileTabRoute: (tab: ClientProfileTab) => void;
  setMobileClientExpandedBucket: React.Dispatch<React.SetStateAction<ClientProfileMobileBucket | null>>;
  setModule: (module: NexOpsModule) => void;
  toggleCreateMenu: () => void;
}

export function ClientDetailsSurface({ bindings }: { bindings: ClientDetailsBindings }): React.ReactElement {
  const {
    activeClientProfileTab,
    clientContactDisplayName,
    clientDisplayName,
    clientFieldMedia,
    clientFieldReports,
    clientOverviewCustomFieldValidation,
    clientOverviewCustomFieldsDraft,
    clientOverviewCustomFieldsOpen,
    clientPortalActivity,
    clientPrimaryAddress,
    clientRailBusy,
    clientRailStatus,
    clientReviewSequences,
    clientSignedDocuments,
    clientStatusLabel,
    deleteClientRecord,
    formatPhoneDisplay,
    lastPortalLink,
    mobileClientExpandedBucket,
    mobileClientViewport,
    MobileClientEditGlyph,
    MobileClientSummaryGlyph,
    openCreateClientDrawer,
    openEditClientWorkspace,
    openWorkspaceTarget,
    operatorContext,
    orderedClientFieldMedia,
    personDisplayName,
    returnToClientRoster,
    saveClientMarketingConsent,
    saveClientOverviewCustomFields,
    selectedClient,
    selectedContact,
    selectedEmail,
    selectedInvoices,
    selectedJobs,
    selectedPayments,
    selectedPhone,
    selectedPhoneValue,
    selectedProperties,
    selectedQuotes,
    selectedReceiptReviewSummaries,
    selectedRequests,
    sendClientPortalLink,
    sendClientStatement,
    setClientOverviewCustomFieldsDraft,
    setClientOverviewCustomFieldsOpen,
    setClientProfileTabRoute,
    setMobileClientExpandedBucket,
    setModule,
    toggleCreateMenu
  } = bindings;

  const relationshipHistory = buildClientRelationshipHistory({
    requests: selectedRequests,
    quotes: selectedQuotes,
    jobs: selectedJobs,
    invoices: selectedInvoices,
    payments: selectedPayments,
    portalActivity: clientPortalActivity,
    reviewSequences: clientReviewSequences,
    // Field technicians do not receive finance rows through the client history.
    financialVisible: operatorContext.role !== "TECHNICIAN"
  });

  function openHistoryEntry(entry: { module?: "requests" | "quotes" | "jobs" | "invoices" | "payments" | "nexreach"; objectId?: string }): void {
    if (entry.module === "nexreach") {
      setModule("nexreach");
      return;
    }
    if (entry.module) {
      openWorkspaceTarget({ module: entry.module, ...(entry.objectId ? { objectId: entry.objectId } : {}) });
    }
  }

  function renderMobileClientProfile(): React.ReactElement {
    if (!selectedClient) {
      return (
        <section className="nexops-mobile-client-profile">
          <div className="nexops-mobile-profile-body">
            <p>The requested client record is not loaded for this tenant right now.</p>
          </div>
        </section>
      );
    }

    const activeTab = activeClientProfileTab ?? "overview";
    const activeBucket = mobileBucketForClientTab(activeTab);
    const expandedBucket = mobileClientExpandedBucket;
    const expandedBucketTabs = expandedBucket ? mobileTabsForBucket(expandedBucket) : [];
    const primaryProperty = selectedProperties[0] ?? null;
    const openSequences = clientReviewSequences.filter((sequence) => sequence.status === "active");
    const recentPortalEntries = [...clientPortalActivity]
      .sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime())
      .slice(0, 5);
    const outstandingBalance = selectedInvoices
      .filter((invoice) => !["paid", "void", "bad_debt"].includes(invoice.status))
      .reduce((total, invoice) => total + (invoice.totals.total ?? 0), 0);
    const formatMoney = (value = 0) => new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    }).format(value);
    const clientCustomFields = visibleCustomFields(selectedClient.customFields, CLIENT_CUSTOM_FIELD_RESERVED_LABELS);
    const latestRequestIntake = selectedQuotes[0]?.intake ?? selectedJobs[0]?.intake ?? selectedInvoices[0]?.intake;
    const requestRows = selectedRequests.map((request) => ({
      id: `request-${request.id}`,
      title: request.subject ?? "Request",
      meta: `${request.reviewedAt ? new Date(request.reviewedAt).toLocaleDateString() : "Awaiting review"} | ${clientPrimaryAddress(selectedClient)}`,
      status: request.status.replaceAll("_", " "),
      statusTone: "#d48806",
      onClick: () => openWorkspaceTarget({ module: "requests", objectId: request.id })
    }));
    const quoteRows = selectedQuotes.map((quote) => ({
      id: `quote-${quote.id}`,
      title: quote.number ?? quote.title,
      meta: `${quote.updatedAt ? new Date(quote.updatedAt).toLocaleDateString() : "Open quote"} | ${formatMoney(quote.totals.total)} | ${clientPrimaryAddress(selectedClient)}`,
      status: quote.status.replaceAll("_", " "),
      statusTone: "#9e4863",
      onClick: () => openWorkspaceTarget({ module: "quotes", objectId: quote.id })
    }));
    const jobRows = selectedJobs.map((job) => ({
      id: `job-${job.id}`,
      title: job.number ? `${job.number} · ${job.title}` : job.title,
      meta: `${job.startAt ? new Date(job.startAt).toLocaleString() : "Not scheduled yet"} | ${primaryProperty ? formatAddress(primaryProperty.address) : clientPrimaryAddress(selectedClient)}`,
      status: job.status,
      statusTone: "#2f9e44",
      onClick: () => openWorkspaceTarget({ module: "jobs", objectId: job.id })
    }));
    const invoiceRows = selectedInvoices.map((invoice) => ({
      id: `invoice-${invoice.id}`,
      title: invoice.number ?? invoice.title,
      meta: `${invoice.updatedAt ? new Date(invoice.updatedAt).toLocaleDateString() : "Billing rail"} | ${formatMoney(invoice.totals.total)} | ${primaryProperty ? formatAddress(primaryProperty.address) : clientPrimaryAddress(selectedClient)}`,
      status: invoice.status.replaceAll("_", " "),
      statusTone: "#2f9e44",
      onClick: () => openWorkspaceTarget({ module: "invoices", objectId: invoice.id })
    }));
    const paymentRows = selectedPayments.map((payment) => ({
      id: `payment-${payment.id}`,
      title: payment.invoiceId ? `Invoice ${payment.invoiceId}` : payment.id,
      meta: `${payment.createdAt ? new Date(payment.createdAt).toLocaleDateString() : payment.provider ?? "Payment rail"} | ${formatMoney(payment.amount ?? 0)}`,
      status: payment.status.replaceAll("_", " "),
      statusTone: "#1f77b4",
      onClick: () => payment.invoiceId ? openWorkspaceTarget({ module: "payments", objectId: payment.invoiceId }) : setModule("payments")
    }));
    const fileMediaTiles = orderedClientFieldMedia.map((media) => ({
      id: `media-${media.id}`,
      label: media.aiCaption ?? media.type,
      kind: "media" as const
    }));
    const summaryContactName = clientContactDisplayName(selectedClient, selectedContact);
    const summaryAddress = primaryProperty ? formatAddress(primaryProperty.address) : clientPrimaryAddress(selectedClient);
    const howTheyFoundUs = typeof selectedClient.customFields?.leadSource === "string" ? selectedClient.customFields.leadSource.trim() : "";
    const referredBy = typeof selectedClient.customFields?.referredBy === "string" ? selectedClient.customFields.referredBy.trim() : "";
    const promoCode = typeof selectedClient.customFields?.promoCode === "string" ? selectedClient.customFields.promoCode.trim() : "";
    const billingAddressLine = selectedClient.billingAddress ? formatAddress(selectedClient.billingAddress) : "";
    const showBillingAddress = Boolean(billingAddressLine) && billingAddressLine !== summaryAddress;
    const extraContacts = (selectedClient.contacts ?? []).map((contact, index) => ({
      id: `${contact.company ?? contact.role ?? "contact"}-${index}`,
      title: personDisplayName(contact.personName ?? {}) || contact.company || contact.role || `Contact ${index + 1}`,
      channel: contact.phones?.[0]?.value ?? contact.emails?.[0]?.value ?? "No direct channel saved",
      detail: contact.role ?? "Client contact"
    }));
    const contactRows = [
      {
        id: "primary",
        title: clientDisplayName(selectedClient),
        channel: selectedPhone?.value ?? selectedEmail ?? "No direct channel saved",
        detail: selectedClient.company?.trim() || "Primary client"
      },
      ...extraContacts
    ];
    const activeSectionLabel = CLIENT_PROFILE_TABS.find((tab) => tab.id === activeTab)?.label ?? "Overview";
    const renderMobileWorkSection = (
      eyebrow: string,
      heading: string,
      emptyCopy: string,
      rows: Array<{ id: string; title: string; meta: string; status: string; statusTone: string; onClick: () => void; }>,
      onOpenRail: () => void
    ): React.ReactElement => (
      <section className="nexops-mobile-profile-section">
        <div className="nexops-mobile-section-head">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h2>{heading}</h2>
          </div>
          <button type="button" onClick={onOpenRail}>Open rail</button>
        </div>
        <div className="nexops-mobile-work-list">
          {rows.map((row) => (
            <button className="nexops-mobile-work-row" key={row.id} type="button" onClick={row.onClick}>
              <div>
                <strong>{row.title}</strong>
                <small>{row.meta}</small>
              </div>
              <span style={{ "--status-dot": row.statusTone } as React.CSSProperties}>{row.status}</span>
            </button>
          ))}
          {!rows.length ? <p className="nexops-empty-copy">{emptyCopy}</p> : null}
        </div>
      </section>
    );

    let sectionContent: React.ReactElement;
    switch (activeTab) {
      case "properties":
        sectionContent = (
          <section className="nexops-mobile-profile-section">
            <div className="nexops-mobile-section-head">
              <div>
                <p className="eyebrow">Properties</p>
                <h2>Service addresses</h2>
              </div>
            </div>
            <div className="nexops-mobile-client-stack">
              {selectedProperties.map((property) => {
                const visiblePropertyFields = visibleCustomFields(property.customFields, PROPERTY_CUSTOM_FIELD_RESERVED_LABELS);
                return (
                  <article className="nexops-mobile-profile-section" key={property.id}>
                    <div className="nexops-mobile-address-block">
                      <strong>{formatAddress(property.address)}</strong>
                    </div>
                    <dl className="nexops-mobile-key-value">
                      <div><dt>Gated Entry</dt><dd>{property.customFields?.gatedEntry === true ? "Yes" : "No"}</dd></div>
                      <div><dt>Gate Entry Code(s)</dt><dd>{property.access?.gateCode ?? "—"}</dd></div>
                      <div><dt>Property Client Name</dt><dd>{String(property.customFields?.propertyClientName ?? "—")}</dd></div>
                      <div><dt>Property Client Telephone Number</dt><dd>{String(property.customFields?.propertyClientPhone ?? "—")}</dd></div>
                      <div><dt>Property Client eMail Address</dt><dd>{String(property.customFields?.propertyClientEmail ?? "—")}</dd></div>
                    </dl>
                    {visiblePropertyFields.length ? (
                      <div className="nexops-mobile-custom-field-readonly">
                        {visiblePropertyFields.map((field) => (
                          <div key={field.key}>
                            <small>{field.label}</small>
                            <strong>{field.value}</strong>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <PropertyAssetsManager property={property} tenantId={operatorContext.tenantId} />
                  </article>
                );
              })}
              {!selectedProperties.length ? <p className="nexops-empty-copy">No properties are attached to this client yet.</p> : null}
            </div>
          </section>
        );
        break;
      case "contacts":
        sectionContent = (
          <section className="nexops-mobile-profile-section">
            <div className="nexops-mobile-section-head">
              <div>
                <p className="eyebrow">Contacts</p>
                <h2>Client contacts</h2>
              </div>
            </div>
            <div className="nexops-mobile-client-list">
              {contactRows.map((contact) => (
                <article className="nexops-mobile-client-list-row active" key={contact.id}>
                  <strong>{contact.title}</strong>
                  <small>{contact.channel}</small>
                  <small>{contact.detail}</small>
                </article>
              ))}
            </div>
          </section>
        );
        break;
      case "requests":
        sectionContent = renderMobileWorkSection("Requests", "Request history", "No requests are attached to this client yet.", requestRows, () => setModule("requests"));
        break;
      case "quotes":
        sectionContent = renderMobileWorkSection("Quotes", "Quote history", "No quotes are attached to this client yet.", quoteRows, () => setModule("quotes"));
        break;
      case "jobs":
        sectionContent = renderMobileWorkSection("Jobs & Visits", "Active work", "No jobs are attached to this client yet.", jobRows, () => setModule("jobs"));
        break;
      case "invoices":
        sectionContent = renderMobileWorkSection("Invoices", "Billing history", "No invoices are attached to this client yet.", invoiceRows, () => setModule("invoices"));
        break;
      case "payments":
        sectionContent = renderMobileWorkSection("Payments", "Money collected", "No payments are attached to this client yet.", paymentRows, () => setModule("payments"));
        break;
      case "notes":
        sectionContent = (
          <section className="nexops-mobile-profile-section">
            <div className="nexops-mobile-section-head">
              <div>
                <p className="eyebrow">Notes & Communications</p>
                <h2>Relationship history</h2>
              </div>
            </div>
            <div className="nexops-mobile-note-actions">
              <span>Notes are not yet stored in this client record.</span>
              <button type="button" onClick={() => openWorkspaceTarget({ module: "capture" })}>📷</button>
            </div>
            <div className="nexops-mobile-work-list">
              {relationshipHistory.map((entry) => entry.module ? (
                <button className="nexops-mobile-work-row" key={entry.id} type="button" onClick={() => openHistoryEntry(entry)}>
                  <div><strong>{entry.title}</strong><small>{entry.occurredAt ? new Date(entry.occurredAt).toLocaleString() : "Date unavailable"}</small></div>
                  <span>{entry.status}</span>
                </button>
              ) : <article className="nexops-mobile-client-list-row" key={entry.id}><strong>{entry.title}</strong><small>{entry.occurredAt ? new Date(entry.occurredAt).toLocaleString() : "Date unavailable"}</small><small>{entry.status}</small></article>)}
              {!relationshipHistory.length ? <p className="nexops-empty-copy">No relationship activity is recorded for this client yet.</p> : null}
            </div>
          </section>
        );
        break;
      case "nexreach":
        sectionContent = (
          <section className="nexops-mobile-profile-section">
            <div className="nexops-mobile-section-head">
              <div>
                <p className="eyebrow">NexReach</p>
                <h2>Marketing permission</h2>
              </div>
            </div>
            <p>{selectedClient.consent.marketing ? "Allowed for NexReach drafts and locality-only showcase review." : "Blocked from NexReach until marketing consent is turned on."}</p>
            <div className="nexops-inline-actions wrap">
              <button type="button" disabled={clientRailBusy === "marketing-consent" || selectedClient.consent.marketing === true} onClick={() => void saveClientMarketingConsent(selectedClient.id, true)}>Allow marketing use</button>
              <button type="button" className="ghost" disabled={clientRailBusy === "marketing-consent" || selectedClient.consent.marketing !== true} onClick={() => void saveClientMarketingConsent(selectedClient.id, false)}>Turn marketing off</button>
            </div>
          </section>
        );
        break;
      case "portal":
        sectionContent = (
          <section className="nexops-mobile-profile-section">
            <div className="nexops-mobile-section-head">
              <div>
                <p className="eyebrow">Client Portal Activity</p>
                <h2>Portal and receipt review</h2>
              </div>
            </div>
            <p>{clientRailStatus}</p>
            {lastPortalLink ? <p><a href={lastPortalLink} target="_blank" rel="noreferrer">{lastPortalLink}</a></p> : null}
            <div className="nexops-inline-actions wrap">
              <button type="button" disabled={clientRailBusy === "portal-link"} onClick={() => void sendClientPortalLink(selectedClient.id)}>Send client hub link</button>
              <button type="button" disabled={clientRailBusy === "send-statement"} onClick={() => void sendClientStatement(selectedClient.id)}>Send statement</button>
            </div>
            {recentPortalEntries.length ? (
              <div className="nexops-mobile-question-answer-list">
                {recentPortalEntries.map((entry) => (
                  <div key={entry.id}>
                    <small>{new Date(entry.occurredAt).toLocaleDateString()}</small>
                    <strong>{entry.title}</strong>
                  </div>
                ))}
              </div>
            ) : null}
            {openSequences.length ? (
              <div className="nexops-mobile-question-answer-list">
                {openSequences.map((sequence) => (
                  <div key={sequence.id}>
                    <small>{sequence.source.replaceAll("_", " ")}</small>
                    <strong>{sequence.nextSendAt ? `Next send ${new Date(sequence.nextSendAt).toLocaleString()}` : "Waiting on next step"}</strong>
                  </div>
                ))}
              </div>
            ) : null}
            {selectedReceiptReviewSummaries.length ? (
              <div className="nexops-mobile-question-answer-list">
                {selectedReceiptReviewSummaries.map((review) => (
                  <div key={review.id}>
                    <small>Receipt review</small>
                    <strong>{review.subject ?? review.id}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <p className="nexops-empty-copy">No receipt-review drafts are tied to this client yet.</p>
            )}
          </section>
        );
        break;
      case "nexdocs":
        sectionContent = (
          <section className="nexops-mobile-profile-section">
            <NexDocsClientWorkspace
              tenantId={operatorContext.tenantId}
              clientId={selectedClient.id}
              clientName={clientDisplayName(selectedClient)}
              role={operatorContext.role}
              nexcamCounts={{
                media: clientFieldMedia.length,
                reports: clientFieldReports.length,
                signedDocuments: clientSignedDocuments.length
              }}
            />
          </section>
        );
        break;
      case "nexcam":
        sectionContent = (
          <section className="nexops-mobile-profile-section">
            <div className="nexops-mobile-section-head">
              <div>
                <p className="eyebrow">NexCam</p>
                <h2>Field media</h2>
              </div>
              <button type="button" onClick={() => openWorkspaceTarget({ module: "capture" })}>Open capture rail</button>
            </div>
            <div className="nexops-mobile-file-grid">
              {fileMediaTiles.map((tile) => (
                <div className={`nexops-mobile-file-tile ${tile.kind}`} key={tile.id}>
                  <span>Photo</span>
                  <strong>{tile.label}</strong>
                </div>
              ))}
            </div>
            {!fileMediaTiles.length ? <p className="nexops-empty-copy">No NexCam media is attached to this client yet.</p> : null}
          </section>
        );
        break;
      case "overview":
      default:
        sectionContent = (
          <div className="nexops-mobile-client-stack">
            <section className="nexops-mobile-profile-section">
              <div className="nexops-mobile-section-head">
                <div className="nexops-mobile-section-banner">
                  <p className="eyebrow">Overview</p>
                  <h2>At a Glance</h2>
                </div>
              </div>
              <dl className="nexops-mobile-key-value">
                <div><dt>How They Found Us</dt><dd>{howTheyFoundUs || "—"}</dd></div>
                {howTheyFoundUs === "Referral" ? <div><dt>Referred By</dt><dd>{referredBy || "—"}</dd></div> : null}
                {promoCode ? <div><dt>Promo Code</dt><dd>{promoCode}</dd></div> : null}
                <div><dt>Payment terms</dt><dd>{selectedClient.customFields?.paymentTerms ? String(selectedClient.customFields.paymentTerms) : "Residential default (Due upon receipt)"}</dd></div>
                {showBillingAddress ? <div><dt>Billing address</dt><dd>{billingAddressLine}</dd></div> : null}
              </dl>
            </section>

            {latestRequestIntake?.fieldValues?.length ? (
              <section className="nexops-mobile-profile-section">
                <div className="nexops-mobile-section-head">
                  <div>
                    <p className="eyebrow">Overview</p>
                    <h2>Service profile</h2>
                  </div>
                </div>
                <div className="nexops-mobile-question-answer-list">
                  {latestRequestIntake.fieldValues.map((field) => (
                    <div key={field.key}>
                      <small>{field.label}</small>
                      <strong>{String(field.value || "—")}</strong>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="nexops-mobile-profile-section">
              <div className="nexops-mobile-section-head">
                <div>
                  <p className="eyebrow">Overview</p>
                  <h2>Custom Fields</h2>
                </div>
                <div className="nexops-inline-actions">
                  <button type="button" onClick={() => setClientOverviewCustomFieldsOpen((current) => !current)}>
                    {clientOverviewCustomFieldsOpen ? "Cancel" : "Edit"}
                  </button>
                </div>
              </div>
              {clientOverviewCustomFieldsOpen ? (
                <div className="nexops-mobile-custom-field-editor">
                  {clientOverviewCustomFieldsDraft.map((row) => (
                    <div className="nexops-mobile-custom-field-editor-row" key={row.id}>
                      <input
                        value={row.label}
                        placeholder="Label"
                        onChange={(event) => setClientOverviewCustomFieldsDraft((current) => current.map((entry) => entry.id === row.id ? { ...entry, label: event.target.value } : entry))}
                      />
                      <input
                        value={row.value}
                        placeholder="Value"
                        onChange={(event) => setClientOverviewCustomFieldsDraft((current) => current.map((entry) => entry.id === row.id ? { ...entry, value: event.target.value } : entry))}
                      />
                      <button type="button" onClick={() => setClientOverviewCustomFieldsDraft((current) => current.filter((entry) => entry.id !== row.id))}>Remove</button>
                    </div>
                  ))}
                  <div className="nexops-inline-actions wrap">
                    <button type="button" onClick={() => setClientOverviewCustomFieldsDraft((current) => [...current, createCustomFieldDraftRow("profile")])}>Add Custom Field</button>
                    <button type="button" disabled={clientRailBusy === "custom-fields" || clientOverviewCustomFieldValidation.hasBlockingIssues} onClick={() => void saveClientOverviewCustomFields(selectedClient.id)}>Save Custom Fields</button>
                  </div>
                  {clientOverviewCustomFieldValidation.hasBlockingIssues ? <p className="nexops-empty-copy">Custom field labels must be unique and cannot reuse built-in labels.</p> : null}
                </div>
              ) : clientCustomFields.length ? (
                <div className="nexops-mobile-custom-field-readonly">
                  {clientCustomFields.map((field) => (
                    <div key={field.key}>
                      <small>{field.label}</small>
                      <strong>{field.value}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="nexops-empty-copy">No custom fields yet.</p>
              )}
            </section>
          </div>
        );
        break;
    }

    return (
      <section className="nexops-mobile-client-profile">
        <div className="nexops-mobile-profile-body">
          <div className="nexops-mobile-profile-summary">
            <div className="nexops-mobile-profile-summary-head">
              <h1>{clientDisplayName(selectedClient)}</h1>
              <button className="nexops-mobile-profile-edit-button" type="button" aria-label="Edit client details" onClick={openEditClientWorkspace}>
                <MobileClientEditGlyph />
              </button>
            </div>
            {summaryContactName ? <p className="nexops-mobile-profile-subtitle">{summaryContactName}</p> : null}
            <div className="nexops-mobile-profile-contact-rail">
              {selectedPhoneValue ? (
                <a className="nexops-mobile-profile-contact-link" href={`tel:${selectedPhoneValue}`}>
                  <span className="nexops-mobile-profile-contact-icon">
                    <MobileClientSummaryGlyph kind="phone" />
                  </span>
                  <span>{formatPhoneDisplay(selectedPhoneValue)}</span>
                </a>
              ) : null}
              {selectedEmail ? (
                <a className="nexops-mobile-profile-contact-link" href={`mailto:${selectedEmail}`}>
                  <span className="nexops-mobile-profile-contact-icon">
                    <MobileClientSummaryGlyph kind="email" />
                  </span>
                  <span>{selectedEmail}</span>
                </a>
              ) : null}
              {summaryAddress ? (
                <a className="nexops-mobile-profile-contact-link" href={nexiMapsHref(summaryAddress)} target="_blank" rel="noreferrer">
                  <span className="nexops-mobile-profile-contact-icon">
                    <MobileClientSummaryGlyph kind="directions" />
                  </span>
                  <span>{summaryAddress}</span>
                </a>
              ) : null}
            </div>
            <div className="nexops-mobile-balance-row">
              <span>Client balance</span>
              <strong>{formatMoney(outstandingBalance)}</strong>
            </div>
            <button className="nexops-mobile-create-button" type="button" onClick={toggleCreateMenu}>+ Create</button>
          </div>

          <div className="nexops-mobile-profile-nav">
            <div className="nexops-mobile-bucket-tabs" role="tablist" aria-label="Client mobile buckets">
              {(Object.keys(CLIENT_PROFILE_MOBILE_BUCKET_LABELS) as ClientProfileMobileBucket[]).map((bucket) => (
                <button
                  key={bucket}
                  type="button"
                  role="tab"
                  aria-selected={activeBucket === bucket}
                  aria-expanded={expandedBucket === bucket}
                  className={activeBucket === bucket ? "active" : ""}
                  onClick={() => {
                    if (expandedBucket === bucket) {
                      setMobileClientExpandedBucket(null);
                      return;
                    }
                    setMobileClientExpandedBucket(bucket);
                    setClientProfileTabRoute(mobileTabsForBucket(bucket)[0]);
                  }}
                >
                  {CLIENT_PROFILE_MOBILE_BUCKET_LABELS[bucket]}
                </button>
              ))}
            </div>

            {expandedBucket ? (
              <div className="nexops-mobile-subsection-shell">
                <small>{CLIENT_PROFILE_MOBILE_BUCKET_LABELS[expandedBucket]} sections</small>
                <div className="nexops-mobile-subsection-tabs" role="tablist" aria-label={`${CLIENT_PROFILE_MOBILE_BUCKET_LABELS[expandedBucket]} sections`}>
                  {expandedBucketTabs.map((tabId) => {
                    const label = CLIENT_PROFILE_TABS.find((tab) => tab.id === tabId)?.label ?? tabId;
                    return (
                      <button
                        key={tabId}
                        type="button"
                        role="tab"
                        aria-selected={activeTab === tabId}
                        className={activeTab === tabId ? "active" : ""}
                        onClick={() => setClientProfileTabRoute(tabId)}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          <div className="nexops-mobile-profile-content" aria-label={activeSectionLabel}>
            {sectionContent}
          </div>
        </div>
      </section>
    );
  }

  function renderClientProfile(): React.ReactElement {
    if (mobileClientViewport) {
      return renderMobileClientProfile();
    }
    if (!selectedClient) {
      return (
        <section className="nexops-client-profile">
          <div className="nexops-client-profile-header-card">
            <button className="nexops-link-button" type="button" onClick={returnToClientRoster}>Back to clients</button>
            <h1>Client profile unavailable</h1>
            <p>The requested client record is not loaded for this tenant right now. Return to the roster and reopen an active record.</p>
          </div>
        </section>
      );
    }

    const formatMoney = (value = 0) => new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    }).format(value);
    const openSequences = clientReviewSequences.filter((sequence) => sequence.status === "active");
    const outstandingBalance = selectedInvoices
      .filter((invoice) => !["paid", "void", "bad_debt"].includes(invoice.status))
      .reduce((total, invoice) => total + (invoice.totals.total ?? 0), 0);
    const lifetimeValue = selectedInvoices
      .filter((invoice) => !["void", "bad_debt"].includes(invoice.status))
      .reduce((total, invoice) => total + (invoice.totals.total ?? 0), 0);
    const nextJob = [...selectedJobs]
      .filter((job) => job.startAt)
      .sort((left, right) => new Date(left.startAt ?? 0).getTime() - new Date(right.startAt ?? 0).getTime())[0];
    const recentPortalEntries = [...clientPortalActivity]
      .sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime())
      .slice(0, 5);

    let tabContent: React.ReactElement;
    switch (activeClientProfileTab ?? "overview") {
      case "requests":
        tabContent = (
          <section className="nexops-client-profile-panel">
            <div className="nexops-client-profile-section-head">
              <div>
                <p className="eyebrow">Requests</p>
                <h2>Request history</h2>
              </div>
              <button type="button" onClick={() => setModule("requests")}>Open requests rail</button>
            </div>
            <div className="nexops-client-profile-list">
              {selectedRequests.map((request) => (
                <button className="nexops-client-profile-row" key={request.id} type="button" onClick={() => openWorkspaceTarget({ module: "requests", objectId: request.id })}>
                  <div>
                    <strong>{request.subject ?? request.id}</strong>
                    <span>{request.status.replaceAll("_", " ")}</span>
                  </div>
                  <small>{request.reviewedAt ? new Date(request.reviewedAt).toLocaleDateString() : "Awaiting review"}</small>
                </button>
              ))}
              {!selectedRequests.length ? <p className="nexops-empty-copy">No requests are attached to this client yet.</p> : null}
            </div>
          </section>
        );
        break;
      case "quotes":
        tabContent = (
          <section className="nexops-client-profile-panel">
            <div className="nexops-client-profile-section-head">
              <div>
                <p className="eyebrow">Quotes</p>
                <h2>Quote history</h2>
              </div>
              <button type="button" onClick={() => setModule("quotes")}>Open quotes rail</button>
            </div>
            <div className="nexops-client-profile-list">
              {selectedQuotes.map((quote) => (
                <button className="nexops-client-profile-row" key={quote.id} type="button" onClick={() => openWorkspaceTarget({ module: "quotes", objectId: quote.id })}>
                  <div>
                    <strong>{quote.number ?? quote.title}</strong>
                    <span>{quote.status.replaceAll("_", " ")} · {formatMoney(quote.totals.total)}</span>
                  </div>
                  <small>{quote.updatedAt ? new Date(quote.updatedAt).toLocaleDateString() : "Open quote"}</small>
                </button>
              ))}
              {!selectedQuotes.length ? <p className="nexops-empty-copy">No quotes are attached to this client yet.</p> : null}
            </div>
          </section>
        );
        break;
      case "jobs":
        tabContent = (
          <section className="nexops-client-profile-panel">
            <div className="nexops-client-profile-section-head">
              <div>
                <p className="eyebrow">Jobs & Visits</p>
                <h2>Active work</h2>
              </div>
              <button type="button" onClick={() => setModule("jobs")}>Open jobs rail</button>
            </div>
            <div className="nexops-client-profile-list">
              {selectedJobs.map((job) => (
                <button className="nexops-client-profile-row" key={job.id} type="button" onClick={() => openWorkspaceTarget({ module: "jobs", objectId: job.id })}>
                  <div>
                    <strong>{job.number ? `${job.number} · ${job.title}` : job.title}</strong>
                    <span>{job.status} · {job.startAt ? new Date(job.startAt).toLocaleString() : "Not scheduled yet"}</span>
                  </div>
                  <small>{job.lineItems?.length ?? 0} line items</small>
                </button>
              ))}
              {!selectedJobs.length ? <p className="nexops-empty-copy">No jobs are attached to this client yet.</p> : null}
            </div>
          </section>
        );
        break;
      case "invoices":
        tabContent = (
          <section className="nexops-client-profile-panel">
            <div className="nexops-client-profile-section-head">
              <div>
                <p className="eyebrow">Invoices</p>
                <h2>Billing history</h2>
              </div>
              <button type="button" onClick={() => setModule("invoices")}>Open invoices rail</button>
            </div>
            <div className="nexops-client-profile-list">
              {selectedInvoices.map((invoice) => (
                <button className="nexops-client-profile-row" key={invoice.id} type="button" onClick={() => openWorkspaceTarget({ module: "invoices", objectId: invoice.id })}>
                  <div>
                    <strong>{invoice.number ?? invoice.title}</strong>
                    <span>{invoice.status.replaceAll("_", " ")} · {formatMoney(invoice.totals.total)}</span>
                  </div>
                  <small>{invoice.updatedAt ? new Date(invoice.updatedAt).toLocaleDateString() : "Billing rail"}</small>
                </button>
              ))}
              {!selectedInvoices.length ? <p className="nexops-empty-copy">No invoices are attached to this client yet.</p> : null}
            </div>
          </section>
        );
        break;
      case "payments":
        tabContent = (
          <section className="nexops-client-profile-panel">
            <div className="nexops-client-profile-section-head">
              <div>
                <p className="eyebrow">Payments</p>
                <h2>Money collected</h2>
              </div>
              <button type="button" onClick={() => setModule("payments")}>Open payments rail</button>
            </div>
            <div className="nexops-client-profile-list">
              {selectedPayments.map((payment) => (
                <button
                  className="nexops-client-profile-row"
                  key={payment.id}
                  type="button"
                  onClick={() => payment.invoiceId ? openWorkspaceTarget({ module: "payments", objectId: payment.invoiceId }) : setModule("payments")}
                >
                  <div>
                    <strong>{payment.invoiceId ? `Invoice ${payment.invoiceId}` : payment.id}</strong>
                    <span>{payment.status.replaceAll("_", " ")} · {formatMoney(payment.amount ?? 0)}</span>
                  </div>
                  <small>{payment.createdAt ? new Date(payment.createdAt).toLocaleDateString() : payment.provider ?? "Payment rail"}</small>
                </button>
              ))}
              {!selectedPayments.length ? <p className="nexops-empty-copy">No payments are attached to this client yet.</p> : null}
            </div>
          </section>
        );
        break;
      case "properties":
        tabContent = (
          <section className="nexops-client-profile-panel">
            <div className="nexops-client-profile-section-head">
              <div>
                <p className="eyebrow">Properties</p>
                <h2>Service addresses</h2>
              </div>
              <button type="button" onClick={() => openCreateClientDrawer("property")}>Add property</button>
            </div>
            <div className="nexops-client-profile-list">
              {selectedProperties.map((property) => (
                <article className="nexops-client-profile-row static" key={property.id}>
                  <div>
                    <strong>{property.siteName || property.label || property.address.street1}</strong>
                    <span>{formatAddress(property.address)}</span>
                  </div>
                  <small>{property.access?.gateCode ? `Gate code saved` : "No gate code saved"}</small>
                </article>
              ))}
              {!selectedProperties.length ? <p className="nexops-empty-copy">No properties are attached to this client yet.</p> : null}
            </div>
          </section>
        );
        break;
      case "contacts":
        tabContent = (
          <section className="nexops-client-profile-panel">
            <div className="nexops-client-profile-section-head">
              <div>
                <p className="eyebrow">Contacts</p>
                <h2>Client contacts</h2>
              </div>
              <button type="button" onClick={() => openCreateClientDrawer("contact")}>Add contact</button>
            </div>
            <div className="nexops-client-profile-list">
              {(selectedClient.contacts ?? []).map((contact, index) => (
                <article className="nexops-client-profile-row static" key={`${contact.company ?? contact.role ?? "contact"}-${index}`}>
                  <div>
                    <strong>{personDisplayName(contact.personName ?? {}) || contact.company || contact.role || `Contact ${index + 1}`}</strong>
                    <span>{contact.phones?.[0]?.value ?? contact.emails?.[0]?.value ?? "No direct channel saved"}</span>
                  </div>
                  <small>{contact.role ?? "Client contact"}</small>
                </article>
              ))}
              {!(selectedClient.contacts ?? []).length ? <p className="nexops-empty-copy">No additional contacts are attached to this client yet.</p> : null}
            </div>
          </section>
        );
        break;
      case "notes":
        tabContent = (
          <section className="nexops-client-profile-panel">
            <div className="nexops-client-profile-section-head">
              <div>
                <p className="eyebrow">Notes & Communications</p>
                <h2>Office context</h2>
              </div>
            </div>
            <div className="nexops-client-profile-grid two-up">
              <article className="nexops-client-profile-card">
                <h3>Relationship history</h3>
                {relationshipHistory.length ? (
                  <ul className="nexops-mini-list">
                    {relationshipHistory.map((entry) => (
                      <li key={entry.id}>
                        {entry.module ? <button type="button" onClick={() => openHistoryEntry(entry)}><strong>{entry.title}</strong><small>{entry.occurredAt ? new Date(entry.occurredAt).toLocaleString() : "Date unavailable"} · {entry.status}</small></button> : <><strong>{entry.title}</strong><small>{entry.occurredAt ? new Date(entry.occurredAt).toLocaleString() : "Date unavailable"} · {entry.status}</small></>}
                      </li>
                    ))}
                  </ul>
                ) : <p>No relationship activity is recorded for this client yet.</p>}
              </article>
              <article className="nexops-client-profile-card">
                <h3>Recent portal activity</h3>
                {recentPortalEntries.length ? (
                  <ul className="nexops-mini-list">
                    {recentPortalEntries.map((entry) => <li key={entry.id}><strong>{entry.title}</strong><small>{entry.detail}</small></li>)}
                  </ul>
                ) : <p>No portal or communication activity is recorded for this client yet.</p>}
              </article>
              <article className="nexops-client-profile-card">
                <h3>Review follow-up</h3>
                {openSequences.length ? (
                  <ul className="nexops-mini-list">
                    {openSequences.map((sequence) => <li key={sequence.id}><strong>{sequence.source.replaceAll("_", " ")}</strong><small>{sequence.nextSendAt ? `Next send ${new Date(sequence.nextSendAt).toLocaleString()}` : "Waiting on next step"}</small></li>)}
                  </ul>
                ) : <p>No review sequence is active for this client.</p>}
              </article>
            </div>
          </section>
        );
        break;
      case "nexdocs":
        tabContent = (
          <section className="nexops-client-profile-panel">
            <NexDocsClientWorkspace
              tenantId={operatorContext.tenantId}
              clientId={selectedClient.id}
              clientName={clientDisplayName(selectedClient)}
              role={operatorContext.role}
              nexcamCounts={{
                media: clientFieldMedia.length,
                reports: clientFieldReports.length,
                signedDocuments: clientSignedDocuments.length
              }}
            />
          </section>
        );
        break;
      case "nexcam":
        tabContent = (
          <section className="nexops-client-profile-panel">
            <div className="nexops-client-profile-section-head">
              <div>
                <p className="eyebrow">NexCam</p>
                <h2>Field media</h2>
              </div>
              <button type="button" onClick={() => openWorkspaceTarget({ module: "capture" })}>Open capture rail</button>
            </div>
            <div className="nexops-client-profile-grid two-up">
              <article className="nexops-client-profile-card">
                <h3>Reports</h3>
                {clientFieldReports.length ? (
                  <ul className="nexops-mini-list">
                    {clientFieldReports.map((report) => <li key={report.id}><strong>{report.title}</strong><small>{report.visitId ? `Visit ${report.visitId}` : `Job ${report.jobId}`}</small></li>)}
                  </ul>
                ) : <p>No field reports are attached to this client yet.</p>}
              </article>
              <article className="nexops-client-profile-card">
                <h3>Media</h3>
                {orderedClientFieldMedia.length ? (
                  <ul className="nexops-mini-list">
                    {orderedClientFieldMedia.map((media) => <li key={media.id}><strong>{media.aiCaption ?? media.type}</strong><small>{media.visitId ? `Visit ${media.visitId}` : media.jobId ? `Job ${media.jobId}` : "Client-level capture"}</small></li>)}
                  </ul>
                ) : <p>No field media is attached to this client yet.</p>}
              </article>
            </div>
          </section>
        );
        break;
      case "nexreach":
        tabContent = (
          <section className="nexops-client-profile-panel">
            <div className="nexops-client-profile-grid two-up">
              <article className="nexops-client-profile-card">
                <h3>Marketing permission</h3>
                <p>{selectedClient.consent.marketing ? "Allowed for NexReach drafts and locality-only showcase review." : "Blocked from NexReach until marketing consent is turned on."}</p>
                <div className="nexops-inline-actions">
                  <button type="button" disabled={clientRailBusy === "marketing-consent" || selectedClient.consent.marketing === true} onClick={() => void saveClientMarketingConsent(selectedClient.id, true)}>Allow marketing use</button>
                  <button type="button" className="ghost" disabled={clientRailBusy === "marketing-consent" || selectedClient.consent.marketing !== true} onClick={() => void saveClientMarketingConsent(selectedClient.id, false)}>Turn marketing off</button>
                </div>
              </article>
              <article className="nexops-client-profile-card">
                <h3>NexReach history</h3>
                <p>NexReach rollout history, opt-in state, and future campaign activity will stay client-visible from this tab.</p>
              </article>
            </div>
          </section>
        );
        break;
      case "portal":
        tabContent = (
          <section className="nexops-client-profile-panel">
            <div className="nexops-client-profile-grid two-up">
              <article className="nexops-client-profile-card">
                <h3>Client portal</h3>
                <p>{clientRailStatus}</p>
                {lastPortalLink ? <p><a href={lastPortalLink} target="_blank" rel="noreferrer">{lastPortalLink}</a></p> : null}
                <div className="nexops-inline-actions">
                  <button type="button" disabled={clientRailBusy === "portal-link"} onClick={() => void sendClientPortalLink(selectedClient.id)}>Send client hub link</button>
                  <button type="button" disabled={clientRailBusy === "send-statement"} onClick={() => void sendClientStatement(selectedClient.id)}>Send statement</button>
                </div>
              </article>
              <article className="nexops-client-profile-card">
                <h3>Receipt review</h3>
                {selectedReceiptReviewSummaries.length ? (
                  <ul className="nexops-mini-list">
                    {selectedReceiptReviewSummaries.map((review) => <li key={review.id}><strong>{review.subject ?? review.id}</strong><small>{review.status.replaceAll("_", " ")}</small></li>)}
                  </ul>
                ) : <p>No receipt-review drafts are tied to this client yet.</p>}
              </article>
            </div>
          </section>
        );
        break;
      case "overview":
      default:
        tabContent = (
          <section className="nexops-client-profile-panel">
            <div className="nexops-client-profile-metrics">
              <article><span>Outstanding balance</span><strong>{formatMoney(outstandingBalance)}</strong><small>Awaiting or partial invoices</small></article>
              <article><span>Lifetime value</span><strong>{formatMoney(lifetimeValue)}</strong><small>Invoice-backed value on this client</small></article>
              <article><span>Open work</span><strong>{selectedRequests.filter((request) => request.status === "new").length + selectedJobs.filter((job) => job.status !== "Archived").length}</strong><small>Requests and active jobs on deck</small></article>
            </div>
            <div className="nexops-client-profile-grid two-up">
              <article className="nexops-client-profile-card">
                <h3>Next move</h3>
                <p>{nextJob ? `${nextJob.title} is next on ${new Date(nextJob.startAt ?? "").toLocaleString()}.` : "No job is scheduled yet for this client."}</p>
                <ul className="nexops-mini-list">
                  <li><strong>Quotes</strong><small>{selectedQuotes.length} on file</small></li>
                  <li><strong>Invoices</strong><small>{selectedInvoices.length} on file</small></li>
                  <li><strong>Payments</strong><small>{selectedPayments.length} on file</small></li>
                  {selectedQuotes.slice(0, 1).map((quote) => <li key={quote.id}><strong>Latest quote</strong><small>{quote.number ?? quote.title} - {quote.status.replaceAll("_", " ")}</small></li>)}
                  {!selectedQuotes.length && !selectedJobs.length ? <li><strong>No work history yet</strong><small>Quotes and jobs will roll up here as soon as the first record lands.</small></li> : null}
                </ul>
              </article>
              <article className="nexops-client-profile-card">
                <h3>Access & follow-through</h3>
                <p>{selectedProperties[0] ? formatAddress(selectedProperties[0].address) : clientPrimaryAddress(selectedClient)}</p>
                <ul className="nexops-mini-list">
                  <li><strong>Properties</strong><small>{selectedProperties.length} site{selectedProperties.length === 1 ? "" : "s"} linked</small></li>
                  <li><strong>Gate notes</strong><small>{selectedProperties[0]?.access?.gateCode ?? selectedProperties[0]?.access?.accessNotes ?? "No gate note saved"}</small></li>
                  <li><strong>Marketing</strong><small>{selectedClient.consent.marketing ? "Allowed" : "Blocked"}</small></li>
                  <li><strong>Recent record</strong><small>{selectedJobs[0]?.title ?? selectedQuotes[0]?.number ?? selectedQuotes[0]?.title ?? "Nothing recent yet"}</small></li>
                </ul>
                <div className="nexops-inline-actions wrap">
                  <button type="button" onClick={() => setClientProfileTabRoute("nexdocs")}>NexDocs</button>
                  <button type="button" onClick={() => setClientProfileTabRoute("nexcam")}>NexCam</button>
                  <button type="button" onClick={() => setClientProfileTabRoute("nexreach")}>NexReach</button>
                  <button type="button" onClick={() => setClientProfileTabRoute("portal")}>Portal activity</button>
                </div>
              </article>
            </div>
          </section>
        );
        break;
    }

    return (
      <section className="nexops-client-profile">
        <div className="nexops-client-profile-header-card">
          <div className="nexops-client-profile-header-actions">
            <button className="nexops-link-button" type="button" onClick={returnToClientRoster}>Back to clients</button>
            <span className="nexops-status-pill">{clientStatusLabel(selectedClient)}</span>
          </div>
          <div className="nexops-client-profile-heading">
            <div>
              <p className="eyebrow">Client workspace</p>
              <h1>{clientDisplayName(selectedClient)}</h1>
              <p>{selectedClient.company?.trim() ? `${selectedClient.company} - ` : ""}{clientPrimaryAddress(selectedClient)}</p>
            </div>
            <div className="nexops-inline-actions wrap">
              {selectedPhone ? <a className="nexops-link-button" href={`tel:${selectedPhone.value}`}>Call</a> : <button type="button" disabled>Call</button>}
              {selectedEmail ? <a className="nexops-link-button" href={`mailto:${selectedEmail}`}>Email</a> : <button type="button" disabled>Email</button>}
              <button type="button" onClick={() => setClientProfileTabRoute("portal")}>More actions</button>
              <button type="button" onClick={toggleCreateMenu}>Create for client</button>
              {!isProtectedLegacyClient(selectedClient) ? (
                <button
                  type="button"
                  className="nexops-kit-action-danger"
                  disabled={clientRailBusy === "delete-client"}
                  onClick={() => void deleteClientRecord(selectedClient.id)}
                >
                  Delete client
                </button>
              ) : null}
            </div>
          </div>
          <div className="nexops-client-profile-meta">
            <article><span>Phone</span><strong>{selectedPhone?.value ?? "Not saved yet"}</strong></article>
            <article><span>Email</span><strong>{selectedEmail ?? "Not saved yet"}</strong></article>
            <article><span>Properties</span><strong>{selectedProperties.length || 1}</strong></article>
            <article><span>Tags</span><strong>{selectedClient.tags?.join(", ") || "No tags"}</strong></article>
          </div>
        </div>

        <div className="nexops-client-profile-tabs" role="tablist" aria-label="Client sections">
          {CLIENT_PROFILE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={(activeClientProfileTab ?? "overview") === tab.id}
              className={(activeClientProfileTab ?? "overview") === tab.id ? "active" : ""}
              onClick={() => setClientProfileTabRoute(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {tabContent}
      </section>
    );
  }


  return renderClientProfile();
}
