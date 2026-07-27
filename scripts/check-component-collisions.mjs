import { execFileSync } from "node:child_process";

const components = [
  ["Contact", [
    "apps/server/src/modules/nexops/areas/clients/components/contact/",
    "apps/web/src/features/clients/components/contact/"
  ]],
  ["Quote Templates", [
    "apps/server/src/modules/nexops/areas/quotes/components/quoteTemplates/",
    "apps/web/src/features/quotes/components/quoteTemplates/"
  ]],
  ["Quote Engine", [
    "apps/server/src/modules/nexops/areas/quotes/components/quoteEngine/",
    "apps/web/src/features/quotes/components/quoteEngine/"
  ]],
  ["Job Core", [
    "apps/server/src/modules/nexops/areas/jobs/components/jobCore/",
    "apps/web/src/features/jobs/components/jobCore/"
  ]],
  ["Visit Core", [
    "apps/server/src/modules/nexops/areas/visits/components/visitCore/",
    "apps/web/src/features/visits/components/visitCore/"
  ]],
  ["Invoice Structure", [
    "apps/server/src/modules/nexops/areas/invoices/components/invoiceStructure/",
    "apps/web/src/features/invoices/components/invoiceStructure/"
  ]],
  ["Payment Rails", [
    "apps/server/src/modules/nexops/areas/invoices/components/paymentRails/",
    "apps/web/src/features/invoices/components/paymentRails/"
  ]],
  ["Catalog", [
    "apps/server/src/modules/nexops/areas/settings/components/catalog/",
    "apps/web/src/features/settings/components/catalog/"
  ]],
  ["Tenant Config", [
    "apps/server/src/modules/nexops/areas/settings/components/tenantConfig/",
    "apps/web/src/features/settings/components/tenantConfig/"
  ]],
  ["Address/Location", [
    "apps/server/src/shared/addressLocation/",
    "packages/shared/src/addressLocation.ts"
  ]],
  ["Document Rendering", [
    "apps/server/src/shared/documentRendering/"
  ]],
  ["Numbering", [
    "apps/server/src/shared/numbering/",
    "packages/shared/src/numbering.ts"
  ]],
  ["Auth/Session", [
    "apps/web/src/shared/auth/"
  ]],
  ["Operator Context", [
    "apps/web/src/features/operatorContext/"
  ]],
  ["Nexi Chat", [
    "apps/web/src/features/nexi/areas/chat/"
  ]],
  ["Nexi Voice", [
    "apps/web/src/features/nexi/areas/voice/"
  ]],
  ["NexCam Capture", [
    "apps/web/src/features/nexcam/areas/capture/"
  ]],
  ["NexCam Overview", [
    "apps/web/src/features/nexcam/areas/overview/"
  ]],
  ["NexDocs Checklists", [
    "apps/web/src/features/nexdocs/areas/checklists/"
  ]],
  ["NexDocs Media", [
    "apps/web/src/features/nexdocs/areas/media/"
  ]],
  ["NexDocs Reports", [
    "apps/web/src/features/nexdocs/areas/reports/"
  ]],
  ["Platform Routing", [
    "apps/web/src/features/platform/"
  ]],
  ["Platform Overview", [
    "apps/web/src/features/platformOverview/"
  ]],
  ["Tenant Overview", [
    "apps/web/src/features/tenantOverview/"
  ]],
  ["NexReach Reputation", [
    "apps/web/src/features/nexreach/areas/reputation/"
  ]],
  ["Approval Queue", [
    "apps/web/src/features/approvalQueue/"
  ]],
  ["Content Queue", [
    "apps/web/src/features/contentQueue/"
  ]],
  ["Queue Primitives", [
    "apps/web/src/features/queueShared/"
  ]],
  ["NexOps Shell", [
    "apps/web/src/features/nexopsShell/"
  ]],
  ["Operations Home", [
    "apps/web/src/features/home/components/operationsHome/"
  ]],
  ["Request Core", [
    "apps/server/src/modules/nexops/areas/requests/components/requestCore/",
    "apps/web/src/features/requests/components/requestCore/"
  ]],
  ["NexDocs Client Workspace", [
    "apps/web/src/features/nexdocs/areas/clientWorkspace/"
  ]],
  ["Product Branding", [
    "apps/web/src/shared/branding/"
  ]],
  ["NexOps UI Kit", [
    "apps/web/src/shared/ui/"
  ]],
  ["Communication Templates", [
    "apps/web/src/shared/communications/"
  ]],
  ["Intake Presentation", [
    "apps/web/src/shared/intake/"
  ]],
  ["Signature Capture", [
    "apps/web/src/shared/signature/"
  ]],
  ["Visual Foundation", [
    "apps/web/src/shared/styles/"
  ]],
  ["File Encoding", [
    "apps/web/src/shared/files/"
  ]]
];

const sharedAllowlist = [
  "apps/web/src/main.tsx",
  "apps/web/src/shared/app/",
  "apps/web/src/shared/router/",
  "apps/server/src/app/",
  "apps/server/src/composeServerApp.ts",
  "apps/server/src/server.ts",
  "apps/server/src/fielddocs/",
  "apps/server/src/nexi/"
];

const trackedFiles = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split(/\r?\n/)
  .map((file) => file.trim().replaceAll("\\", "/"))
  .filter(Boolean);

const owned = new Map(components.map(([name, roots]) => [
  name,
  new Set(trackedFiles.filter((file) => roots.some((root) => root.endsWith("/") ? file.startsWith(root) : file === root)))
]));

const failures = [];
console.log(`Shared allowlist: ${sharedAllowlist.join(", ")}`);

const rootWebFiles = trackedFiles.filter((file) => /^apps\/web\/src\/[^/]+\.(css|ts|tsx)$/.test(file));
const unclassifiedRootWebFiles = rootWebFiles.filter((file) => !sharedAllowlist.includes(file));
console.log(`Root web allowlist coverage: ${rootWebFiles.length - unclassifiedRootWebFiles.length}/${rootWebFiles.length}`);
if (unclassifiedRootWebFiles.length > 0) {
  failures.push(`unclassified root web files: ${unclassifiedRootWebFiles.join(", ")}`);
}

for (const [name, files] of owned) {
  if (files.size === 0) failures.push(`${name} owns no tracked implementation files`);
  console.log(`${name}: ${files.size} files`);
}

let pairCount = 0;
for (let leftIndex = 0; leftIndex < components.length; leftIndex += 1) {
  for (let rightIndex = leftIndex + 1; rightIndex < components.length; rightIndex += 1) {
    pairCount += 1;
    const leftName = components[leftIndex][0];
    const rightName = components[rightIndex][0];
    const overlap = [...owned.get(leftName)].filter((file) => owned.get(rightName).has(file));
    console.log(`${leftName} intersect ${rightName}: ${overlap.length}`);
    if (overlap.length > 0) failures.push(`${leftName} / ${rightName}: ${overlap.join(", ")}`);
  }
}

if (failures.length > 0) {
  console.error("Component collision check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Component collision check passed (${components.length} components, ${pairCount} pairs, zero overlaps).`);
