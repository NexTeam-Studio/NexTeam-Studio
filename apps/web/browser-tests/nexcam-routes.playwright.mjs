import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";

import { NexCamOverviewSurface } from "../src/features/nexcam/areas/overview/components/NexCamOverviewSurface.tsx";
import { ChecklistTemplatesSurface } from "../src/features/nexdocs/areas/checklists/components/ChecklistTemplatesSurface.tsx";
import { MediaLibrarySurface } from "../src/features/nexdocs/areas/media/components/MediaLibrarySurface.tsx";
import { ReportsSurface } from "../src/features/nexdocs/areas/reports/components/ReportsSurface.tsx";

const client = {
  id: "client_smoke",
  personName: { firstName: "Smoke", lastName: "Client" },
  company: "Smoke Client",
  displayNamePreference: "person",
  emails: [],
  phones: []
};

function workspaceFixture() {
  const values = {
    activeChecklistSection: "Overview",
    activeSectionAllowsNa: false,
    activeSectionIsNa: false,
    bundleDraft: { label: "", jobTypeKey: "", checklistTemplateId: "", reportTemplateId: "", active: true },
    bundles: [],
    carryforwardFields: [],
    checklist: null,
    checklistSections: [],
    clients: [client],
    contextIds: { propertyId: "", jobId: "", visitId: "" },
    dateFrom: "",
    dateTo: "",
    draftField: { label: "", section: "", type: "free_text", memory: "visit", helpText: "", unit: "", optionsText: "", required: false, photoRequiredDefault: false },
    draftFields: [],
    draftSections: [],
    includeTrashed: false,
    latestHistory: [],
    mediaHits: [],
    mediaQuery: "",
    recentChecklists: [],
    recentMedia: [],
    report: null,
    reportKind: "visit",
    reportTemplateDraft: { title: "", defaultReportTitle: "", watermarkByDefault: false },
    reportTemplateSections: [],
    reportTemplates: [],
    reportTitle: "",
    reportUrl: "",
    reports: [],
    selectedTemplateId: "",
    selectedReportTemplateId: "",
    selectedSnippetIds: [],
    snippetDraft: { label: "", bodyText: "" },
    template: null,
    templateDraft: { title: "", slug: "", description: "", appliesTo: "visit" },
    templates: [],
    textSnippets: [],
    visibleChecklistFields: [],
    watermarkEnabled: false
  };
  return new Proxy(values, {
    get(target, property) {
      if (property in target) return target[property];
      return () => undefined;
    }
  });
}

const routeSurfaces = [
  ["/nexcam", "Template-driven field capture", NexCamOverviewSurface],
  ["/nexcam/templates", "Checklist Templates", ChecklistTemplatesSurface],
  ["/nexcam/photos", "Photos & Media", MediaLibrarySurface],
  ["/nexcam/reports", "Reports", ReportsSurface]
];

test("all four NexCam routed surfaces render without a browser runtime exception", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [path, expectedText, Surface] of routeSurfaces) {
      const markup = renderToStaticMarkup(React.createElement(Surface, { workspace: workspaceFixture() }));
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await page.setContent(`<!doctype html><html><body>${markup}</body></html>`, { waitUntil: "domcontentloaded" });
      assert.match(await page.locator("body").innerText(), new RegExp(expectedText, "i"), `${path} should render its routed surface`);
      assert.deepEqual(pageErrors, [], `${path} should not throw a browser runtime error`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
