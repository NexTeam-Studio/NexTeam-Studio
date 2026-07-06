import { mkdir, writeFile } from "node:fs/promises";
import { getAdminDb } from "../apps/server/src/firebase.js";
import { FirestoreNexiRepository, MemoryNexiRepository } from "../apps/server/src/nexi/nexiRepository.js";
import { readCompanyCamReports, siteJobBlueprintFromCompanyCamReport } from "../apps/server/src/nexi/reportDocuments.js";
import type { Tenant } from "@nexteam/core";

const tenantId = process.env.TENANT_ID || "aquatrace";
const projectQuery = process.env.COMPANYCAM_REPORT_QUERY || "Deborah Justice";
const question = process.env.COMPANYCAM_REPORT_QUESTION || `What were the leak detection results and total gallons for ${projectQuery}?`;
const receiptPath = process.env.COMPANYCAM_REPORT_INGEST_RECEIPT || "receipts/m1/companycam-report-ingest-deborah-justice.json";

function tenant(): Tenant {
  return {
    id: tenantId,
    name: tenantId === "aquatrace" ? "Aquatrace" : tenantId,
    industryPack: "pool_leak",
    branding: { assistantName: "Nexi" },
    adapters: { crm: "jobber", media: "companycam", email: "gmail_relay" },
    approval: {
      email: { autoApprove: false, cleanStreak: 0 },
      sms: { autoApprove: false, cleanStreak: 0 },
      gbp_post: { autoApprove: false, cleanStreak: 0 },
      social_post: { autoApprove: false, cleanStreak: 0 },
      article: { autoApprove: false, cleanStreak: 0 },
      quote: { autoApprove: false, cleanStreak: 0 },
      invoice: { autoApprove: false, cleanStreak: 0 },
      site_publish: { autoApprove: false, cleanStreak: 0 },
      review_reply: { autoApprove: false, cleanStreak: 0 }
    },
    timezone: "America/New_York",
    plan: "suite"
  };
}

const db = getAdminDb();
const repository = db ? new FirestoreNexiRepository(db) : new MemoryNexiRepository();
const reportRead = await readCompanyCamReports({ tenant: tenant(), projectQuery, question, maxDocuments: 4 });
const savedBlueprints = [];

if (reportRead.project) {
  for (const report of reportRead.reports.filter((item) => item.parsed && Object.keys(item.fields).length > 0)) {
    const blueprint = siteJobBlueprintFromCompanyCamReport({ tenantId, project: reportRead.project, report });
    savedBlueprints.push(await repository.saveSiteJobBlueprint(blueprint));
  }
}

const receipt = {
  ok: true,
  dryRun: false,
  destructiveVendorWrites: false,
  vendorMode: "companycam_read_only",
  tenantId,
  projectQuery,
  question,
  project: reportRead.project,
  counts: {
    candidateProjects: reportRead.projects.length,
    documents: reportRead.documents.length,
    parsedReports: reportRead.reports.filter((item) => item.parsed).length,
    savedSiteJobBlueprints: savedBlueprints.length
  },
  documents: reportRead.documents,
  reports: reportRead.reports,
  savedSiteJobBlueprints: savedBlueprints,
  sampledAt: new Date().toISOString()
};

await mkdir("receipts/m1", { recursive: true });
await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({
  ok: true,
  receiptPath,
  project: reportRead.project ? { id: reportRead.project.id, name: reportRead.project.name } : null,
  counts: receipt.counts,
  savedSiteJobBlueprintIds: savedBlueprints.map((item) => item.id)
}, null, 2));
