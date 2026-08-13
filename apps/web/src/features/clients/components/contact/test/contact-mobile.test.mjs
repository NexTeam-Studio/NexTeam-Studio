import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { NexOpsCreateClientPanel } from "../NexOpsCreateClientPanel.tsx";
import { CLIENT_PROFILE_TABS } from "../../../../nexopsShell/domain/nexopsNavigation.ts";
import {
  buildLeadSourceOptions,
  CLIENT_CUSTOM_FIELD_RESERVED_LABELS,
  customFieldDraftRowsToRecord,
  DEFAULT_LEAD_SOURCE_OPTIONS,
  draftNameFieldsFromClientRecord,
  LEAD_SOURCE_ADD_NEW_OPTION,
  mobileBucketForClientTab,
  mobileTabsForBucket,
  primaryClientPhoneValue,
  validateCustomFieldDraftRows
} from "../domain/clientProfile.ts";


function blankDraft() {
  return {
    title: "No title",
    firstName: "",
    lastName: "",
    company: "",
    role: "",
    displayNamePreference: "person",
    phone: "",
    phoneLabel: "Main",
    phoneReceivesMessages: false,
    smsCapability: "unknown",
    additionalPhones: [],
    email: "",
    emailLabel: "Main",
    additionalEmails: [],
    paymentTerms: "",
    askForReview: true,
    referredBy: "",
    promoCode: "",
    clientCustomFieldsDraft: [],
    additionalContactName: "",
    additionalContactRole: "",
    additionalContactPhone: "",
    additionalContactEmail: "",
    siteName: "",
    street1: "",
    street2: "",
    city: "",
    province: "",
    postalCode: "",
    country: "US",
    propertyGeoLat: undefined,
    propertyGeoLng: undefined,
    billingSameAsPrimaryProperty: true,
    billingStreet1: "",
    billingStreet2: "",
    billingCity: "",
    billingProvince: "",
    billingPostalCode: "",
    leadSource: "",
    propertyGatedEntry: false,
    propertyGateCodes: "",
    propertyClientName: "",
    propertyClientPhone: "",
    propertyClientEmail: "",
    propertyAccessNotes: "",
    propertyCustomFieldsDraft: []
  };
}

test("mobile client helpers group the 13 profile tabs into the expected buckets", () => {
  assert.equal(mobileBucketForClientTab("overview"), "client");
  assert.equal(mobileBucketForClientTab("properties"), "client");
  assert.equal(mobileBucketForClientTab("jobs"), "work");
  assert.equal(mobileBucketForClientTab("payments"), "work");
  assert.equal(mobileBucketForClientTab("notes"), "notes");
  assert.equal(mobileBucketForClientTab("portal"), "notes");
  assert.equal(mobileBucketForClientTab("nexdocs"), "files");
  assert.deepEqual(mobileTabsForBucket("client"), ["overview", "properties", "contacts"]);
  assert.deepEqual(mobileTabsForBucket("work"), ["requests", "quotes", "jobs", "invoices", "payments"]);
  assert.deepEqual(mobileTabsForBucket("notes"), ["notes", "nexreach", "portal"]);
  assert.deepEqual(mobileTabsForBucket("files"), ["nexdocs", "nexcam"]);
});

test("the two-tier mobile bucket mapping preserves all 13 client sections without merging ids", () => {
  const bucketedTabs = ["client", "work", "notes", "files"].flatMap((bucket) => mobileTabsForBucket(bucket));
  assert.deepEqual(
    [...bucketedTabs].sort(),
    CLIENT_PROFILE_TABS.map((tab) => tab.id).sort()
  );
  assert.equal(new Set(bucketedTabs).size, CLIENT_PROFILE_TABS.length);
});

test("each mobile bucket auto-select target is the first real section in that bucket", () => {
  assert.equal(mobileTabsForBucket("client")[0], "overview");
  assert.equal(mobileTabsForBucket("work")[0], "requests");
  assert.equal(mobileTabsForBucket("notes")[0], "notes");
  assert.equal(mobileTabsForBucket("files")[0], "nexdocs");
});

test("lead source options stay fixed in the confirmed mobile intake order", () => {
  const options = buildLeadSourceOptions([
    { customFields: { leadSource: "Google" } },
    { customFields: { leadSource: "Vehicle Wrap" } },
    { customFields: { leadSource: "Neighborhood Mailer" } }
  ]);
  assert.deepEqual(options, DEFAULT_LEAD_SOURCE_OPTIONS);
  assert.equal(options.includes("Neighborhood Mailer"), false);
  assert.equal(LEAD_SOURCE_ADD_NEW_OPTION, "+ Add New");
});

test("edit drafts recover person fields from the saved client name when structured names are missing", () => {
  assert.deepEqual(
    draftNameFieldsFromClientRecord({
      clientName: "Logan Sears",
      displayNamePreference: "person"
    }),
    {
      firstName: "Logan",
      lastName: "Sears"
    }
  );

  assert.deepEqual(
    draftNameFieldsFromClientRecord({
      clientName: "Aquatrace Swimming Pool Leak Detection",
      company: "Aquatrace Swimming Pool Leak Detection",
      displayNamePreference: "company"
    }),
    {
      firstName: "",
      lastName: ""
    }
  );
});

test("mobile client summary phone falls back to the client phone list when no contact phone exists", () => {
  assert.equal(
    primaryClientPhoneValue({
      contactPhones: [],
      clientPhones: ["8645551725"]
    }),
    "8645551725"
  );

  assert.equal(
    primaryClientPhoneValue({
      contactPhones: [
        { value: "8641110000" },
        { value: "8642220000", primary: true }
      ],
      clientPhones: ["8645551725"]
    }),
    "8642220000"
  );
});

test("custom field drafts reject reserved labels and serialize unique rows", () => {
  const rows = [
    { id: "1", label: "Pool Finish", value: "Pebble" },
    { id: "2", label: "pool finish", value: "Plaster" },
    { id: "3", label: "leadSource", value: "Google" },
    { id: "4", label: "Access Window", value: "After 3 PM" }
  ];
  const validation = validateCustomFieldDraftRows(rows, CLIENT_CUSTOM_FIELD_RESERVED_LABELS);
  assert.equal(validation.hasBlockingIssues, true);
  assert.deepEqual(validation.duplicateLabels, ["pool finish"]);
  assert.deepEqual(validation.reservedConflicts, ["leadSource"]);

  const serialized = customFieldDraftRowsToRecord(
    [
      { id: "1", label: "Pool Finish", value: "Pebble" },
      { id: "2", label: "Access Window", value: "After 3 PM" }
    ],
    CLIENT_CUSTOM_FIELD_RESERVED_LABELS
  );
  assert.deepEqual(serialized, {
    "Pool Finish": "Pebble",
    "Access Window": "After 3 PM"
  });
});

test("desktop intake renders saved custom-field draft rows and avoids unsupported intake actions", () => {
  const html = renderToStaticMarkup(
    React.createElement(NexOpsCreateClientPanel, {
      tenantId: "tenant-a",
      newClient: {
        ...blankDraft(),
        clientCustomFieldsDraft: [{ id: "client_1", label: "Preferred Crew", value: "Blue Team" }],
        propertyCustomFieldsDraft: [{ id: "property_1", label: "Pool Finish", value: "Pebble" }]
      },
      setNewClient: () => {},
      createStatus: "",
      createClientCanSave: false,
      createClientMissingFields: ["name", "telephone", "address"],
      onClose: () => {},
      onSubmit: () => {}
    })
  );

  assert.match(html, /value="Preferred Crew"/);
  assert.match(html, /value="Blue Team"/);
  assert.match(html, /value="Pool Finish"/);
  assert.match(html, /value="Pebble"/);
  assert.match(html, /Remove Custom Field/);
  assert.match(html, /Tax rates are not configured in client intake/);
  assert.doesNotMatch(html, />Add Contact</);
  assert.doesNotMatch(html, />Tax Rate</);
});

test("page-mode client intake keeps phone and address visible while collapsing secondary sections", () => {
  const html = renderToStaticMarkup(
    React.createElement(NexOpsCreateClientPanel, {
      tenantId: "aquatrace",
      newClient: blankDraft(),
      setNewClient: () => {},
      createStatus: "",
      createClientCanSave: false,
      createClientMissingFields: ["name", "telephone", "address"],
      leadSourceOptions: ["Google", "Referral"],
      layout: "page",
      surface: "client",
      onClose: () => {},
      onSubmit: () => {}
    })
  );

  assert.match(html, /New client/i);
  assert.match(html, /Phone number/i);
  assert.match(html, /Property address/i);
  assert.match(html, /Add Email/i);
  assert.match(html, /How They Found Us/i);
  assert.match(html, /Add Additional Info/i);
  assert.match(html, /Add Additional Property Info/i);
  assert.match(html, /Name, phone, and address needed to save/i);
});

test("page-mode client intake only shows Referred By when Referral is selected", () => {
  const referralDraft = {
    ...blankDraft(),
    leadSource: "Referral"
  };
  const referralHtml = renderToStaticMarkup(
    React.createElement(NexOpsCreateClientPanel, {
      tenantId: "aquatrace",
      newClient: referralDraft,
      setNewClient: () => {},
      createStatus: "",
      createClientCanSave: false,
      createClientMissingFields: ["name", "telephone", "address"],
      leadSourceOptions: DEFAULT_LEAD_SOURCE_OPTIONS,
      layout: "page",
      surface: "client",
      onClose: () => {},
      onSubmit: () => {}
    })
  );
  assert.match(referralHtml, /How They Found Us: Referral/i);
  assert.match(referralHtml, /Referred By/i);

  const googleDraft = {
    ...blankDraft(),
    leadSource: "Google"
  };
  const googleHtml = renderToStaticMarkup(
    React.createElement(NexOpsCreateClientPanel, {
      tenantId: "aquatrace",
      newClient: googleDraft,
      setNewClient: () => {},
      createStatus: "",
      createClientCanSave: false,
      createClientMissingFields: ["name", "telephone", "address"],
      leadSourceOptions: DEFAULT_LEAD_SOURCE_OPTIONS,
      layout: "page",
      surface: "client",
      onClose: () => {},
      onSubmit: () => {}
    })
  );
  assert.match(googleHtml, /How They Found Us: Google/i);
  assert.doesNotMatch(googleHtml, /Referred By/i);
  assert.match(googleHtml, /Promo Code/i);
});
