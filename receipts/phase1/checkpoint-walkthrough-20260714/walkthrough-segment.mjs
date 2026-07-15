import { chromium } from "playwright";
import { promises as fs } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

const baseWeb = process.env.NEXOPS_BASE_URL ?? "http://127.0.0.1:4275";
const baseApi = process.env.NEXOPS_API_URL ?? "http://127.0.0.1:3201";
const artifactDir = process.env.WALKTHROUGH_ARTIFACT_DIR
  ?? "C:/Users/Peyto/NexTeam-Studio-worktrees/nightly-integration-20260709/receipts/phase1/checkpoint-walkthrough-20260714";
const rawDir = path.join(artifactDir, "raw");
const shotsDir = path.join(artifactDir, "screens");
const logsDir = path.join(artifactDir, "markers");
const statePath = path.join(artifactDir, "walkthrough-state.json");
const segment = process.argv[2];
const record = process.argv.includes("--record");
const headless = !process.argv.includes("--headed");

if (!segment || !["request-to-quote", "quote-to-job", "job-to-payment"].includes(segment)) {
  console.error("Usage: node walkthrough-segment.mjs <request-to-quote|quote-to-job|job-to-payment> [--record] [--headed]");
  process.exit(1);
}

const scenario = {
  clientName: "Riley Harper",
  email: "riley.harper@example.com",
  phone: "8645550182",
  street1: "412 Pebble Shore Dr",
  city: "Seneca",
  province: "SC",
  postalCode: "29672",
  poolType: "residential",
  poolConfiguration: "pool_and_spa",
  poolSurface: "pebble",
  waterLossRate: "1.5 inches per day",
  gateCode: "7731",
  petName: "Ranger",
  issueSummary: "Pool is losing water overnight near the spa spillway and equipment pad.",
  customLineCode: "LD-POOL-001",
  customLineName: "Leak detection visit",
  customLineDescription: "Pressure test, dye test, and equipment pad leak survey.",
  customLineQty: "1",
  customLineUnitPrice: "425",
  discountValue: "10",
  taxRate: "7.25",
  depositValue: "30",
  quoteTerms: "Approval locks the quote. Any post-approval scope changes move to the job as new line items.",
  visitTitle: "Leak detection visit",
  receiptSubject: "Leak detection receipt, report, and photo bundle"
};

const ffmpegCandidates = [
  "C:/Users/Peyto/.openclaw/workspace/daily-cunstitution/node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe",
  "C:/Users/Peyto/.openclaw/workspace/daily-cunstitution/tools/ffmpeg/bin/ffmpeg.exe"
];

const markers = [];
const startMs = Date.now();
let shotIndex = 0;

function secondsSinceStart() {
  return Number(((Date.now() - startMs) / 1000).toFixed(1));
}

function stamp(label, piece, note = "") {
  const entry = { atSeconds: secondsSinceStart(), label, piece, note };
  markers.push(entry);
  console.log(`[${segment}] ${entry.atSeconds}s :: ${label}${note ? ` :: ${note}` : ""}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizePortalUrl(value) {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value, baseWeb);
    if (url.pathname.startsWith("/portal/")) {
      const apiBase = new URL(baseApi);
      url.protocol = apiBase.protocol;
      url.host = apiBase.host;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

async function ensureDirs() {
  await fs.mkdir(artifactDir, { recursive: true });
  await fs.mkdir(rawDir, { recursive: true });
  await fs.mkdir(shotsDir, { recursive: true });
  await fs.mkdir(logsDir, { recursive: true });
}

async function maybeShot(page, label) {
  shotIndex += 1;
  const file = path.join(shotsDir, `${segment}-${String(shotIndex).padStart(2, "0")}-${slugify(label)}.png`);
  await page.screenshot({ path: file, fullPage: true });
}

async function writeMarkers(extra = {}) {
  const payload = {
    segment,
    record,
    createdAt: new Date().toISOString(),
    baseWeb,
    baseApi,
    markers,
    ...extra
  };
  await fs.writeFile(path.join(logsDir, `${segment}.json`), JSON.stringify(payload, null, 2));
}

async function readState() {
  const raw = await fs.readFile(statePath, "utf8");
  return JSON.parse(raw);
}

async function writeState(next) {
  await fs.writeFile(statePath, JSON.stringify(next, null, 2));
}

function localDateTimeInput(daysAhead, hour, minute) {
  const next = new Date();
  next.setDate(next.getDate() + daysAhead);
  next.setHours(hour, minute, 0, 0);
  const yyyy = String(next.getFullYear());
  const mm = String(next.getMonth() + 1).padStart(2, "0");
  const dd = String(next.getDate()).padStart(2, "0");
  const hh = String(next.getHours()).padStart(2, "0");
  const min = String(next.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

async function apiGet(pathname) {
  const response = await fetch(`${baseApi}${pathname}`);
  if (!response.ok) {
    throw new Error(`GET ${pathname} failed with ${response.status}`);
  }
  return response.json();
}

async function poll(description, fn, timeoutMs = 12000, intervalMs = 300) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await fn();
    if (value) {
      return value;
    }
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function latestRequest() {
  const body = await apiGet("/api/crm/requests?tenantId=aquatrace");
  return body.requests?.at(-1) ?? null;
}

async function latestQuote() {
  const body = await apiGet("/api/crm/quotes?tenantId=aquatrace");
  return body.quotes?.at(-1) ?? null;
}

async function latestJob() {
  const body = await apiGet("/api/crm/jobs?tenantId=aquatrace");
  return body.jobs?.at(-1) ?? null;
}

async function latestInvoice() {
  const body = await apiGet("/api/crm/invoices?tenantId=aquatrace");
  return body.invoices?.at(-1) ?? null;
}

function pickFfmpeg() {
  for (const candidate of ffmpegCandidates) {
    try {
      spawnSync(candidate, ["-version"], { stdio: "ignore" });
      return candidate;
    } catch {
      // Keep looking.
    }
  }
  return null;
}

function convertToMp4(inputPath, outputPath) {
  const ffmpeg = pickFfmpeg();
  if (!ffmpeg) {
    throw new Error("ffmpeg not found for webm -> mp4 conversion.");
  }
  const result = spawnSync(ffmpeg, [
    "-y",
    "-i",
    inputPath,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    outputPath
  ], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed for ${path.basename(outputPath)}: ${result.stderr || result.stdout}`);
  }
}

async function newVideoPage() {
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    recordVideo: record ? { dir: rawDir, size: { width: 1440, height: 960 } } : undefined
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(20000);
  return { browser, context, page, video: page.video() ?? null };
}

async function finalizeVideo(browser, context, pageVideo, basename) {
  await context.close();
  await browser.close();
  if (!record || !pageVideo) {
    return null;
  }
  const webmPath = await pageVideo.path();
  const rawTarget = path.join(rawDir, `${basename}.webm`);
  await fs.copyFile(webmPath, rawTarget);
  const mp4Target = path.join(artifactDir, `${basename}.mp4`);
  convertToMp4(rawTarget, mp4Target);
  return { rawTarget, mp4Target };
}

async function requestToQuote() {
  const { browser, context, page, video } = await newVideoPage();
  let videoFiles = null;
  try {
    await page.goto(`${baseWeb}/request-forms/aquatrace/service-request`, { waitUntil: "networkidle" });
    stamp("Public intake form loaded", "Piece 1 § intake");
    await sleep(1000);
    await maybeShot(page, "public-form-loaded");

    await page.locator('input[name="client_name"]').fill(scenario.clientName);
    await page.locator('input[name="email"]').fill(scenario.email);
    await page.locator('input[name="phone"]').fill(scenario.phone);
    await page.locator('select[name="preferred_contact_method"]').selectOption("text");
    await page.locator('input[name="property_street1"]').fill(scenario.street1);
    await page.locator('input[name="property_city"]').fill(scenario.city);
    await page.locator('input[name="property_province"]').fill(scenario.province);
    await page.locator('input[name="property_postal_code"]').fill(scenario.postalCode);
    await page.locator('select[name="pool_type"]').selectOption(scenario.poolType);
    await page.locator('select[name="pool_configuration"]').selectOption(scenario.poolConfiguration);
    await page.locator('select[name="pool_surface"]').selectOption(scenario.poolSurface);
    await page.locator('input[name="water_loss_rate"]').fill(scenario.waterLossRate);
    await page.locator('input[name="gate_code"]').fill(scenario.gateCode);
    await page.locator('input[name="pet_present"]').check();
    await page.locator('input[name="pet_name"]').fill(scenario.petName);
    await page.locator('textarea[name="issue_summary"]').fill(scenario.issueSummary);
    stamp("Request fields filled", "Piece 1 § intake", "Gate code, pet flag, and pool fields included.");
    await sleep(800);

    await page.getByRole("button", { name: "Send request" }).click();
    await page.waitForURL(/\/api\/request-forms\/aquatrace\/service-request\/submit/);
    await page.getByText("Request received").waitFor();
    stamp("Request submitted", "Piece 1 § intake");
    await sleep(1200);
    await maybeShot(page, "request-received");

    const request = await poll("new request record", latestRequest);

    await page.goto(`${baseWeb}/nexops/requests`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Requests" }).waitFor();
    await page.locator(".nexops-request-row-button").filter({ hasText: scenario.clientName }).first().click();
    await page.getByRole("heading", { name: scenario.clientName }).waitFor();
    stamp("Request detail opened", "Piece 1 § review");
    await sleep(1000);

    const reviewedButton = page.getByRole("button", { name: "Mark reviewed" });
    if (await reviewedButton.count()) {
      await reviewedButton.click();
      await reviewedButton.waitFor({ state: "detached" });
      stamp("Match review marked complete", "Piece 1 § review");
      await sleep(800);
    }

    const gateRow = page.locator(".nexops-request-propagation-row").filter({ hasText: "Gate code" }).first();
    await gateRow.scrollIntoViewIfNeeded();
    stamp("Downstream propagation shown", "Piece 1 § propagation", "Gate code row visible across request/quote/job/visit/invoice.");
    await sleep(1200);
    await maybeShot(page, "request-propagation");

    await page.getByRole("button", { name: "Convert to quote" }).click();
    const quote = await poll("converted quote", latestQuote);
    stamp("Request converted to quote", "Pieces 1-2 handoff", quote.number ?? quote.id);
    await sleep(1000);

    await page.goto(`${baseWeb}/nexops/quotes`, { waitUntil: "networkidle" });
    await page.locator(".nexops-request-row-button").filter({ hasText: quote.number ?? quote.title }).first().click();
    await page.getByRole("button", { name: "Edit in composer" }).click();
    await page.getByRole("heading", { name: "Edit quote" }).waitFor();
    const composerCard = page.locator(".nexops-quote-composer-card");
    stamp("Quote composer opened", "Piece 2 § composer");
    await sleep(800);

    await composerCard.getByRole("button", { name: "Add custom line" }).click();
    const lineCard = composerCard.locator(".nexops-quote-line-card").last();
    await lineCard.locator("label").filter({ hasText: "Custom code" }).locator("input").fill(scenario.customLineCode);
    await lineCard.locator("label").filter({ hasText: "Name" }).locator("input").fill(scenario.customLineName);
    await lineCard.locator("label").filter({ hasText: "Description" }).locator("input").fill(scenario.customLineDescription);
    await lineCard.locator("label").filter({ hasText: "Qty" }).locator("input").fill(scenario.customLineQty);
    await lineCard.locator("label").filter({ hasText: "Unit price" }).locator("input").fill(scenario.customLineUnitPrice);
    stamp("Custom line item added", "Piece 2 § line items");

    await composerCard.getByLabel("Require signature").check();
    await composerCard.getByLabel("Require deposit").check();
    await composerCard.getByLabel("Require card on file").check();
    await composerCard.locator('label:has-text("Deposit type") select').selectOption("percent");
    await composerCard.locator('label:has-text("Deposit value") input').fill(scenario.depositValue);
    await composerCard.locator('label:has-text("Discount kind") select').selectOption("percent");
    await composerCard.locator('label:has-text("Discount value") input').fill(scenario.discountValue);
    await composerCard.locator('label:has-text("Tax rate (%)") input').fill(scenario.taxRate);
    await composerCard.locator('label:has-text("Terms and disclaimer") textarea').fill(scenario.quoteTerms);
    stamp("Approval rules, discount, tax, and terms set", "Piece 2 § rules");
    await sleep(1200);
    await maybeShot(page, "quote-composer");

    await composerCard.getByRole("button", { name: "Save changes" }).click();
    await poll("saved quote total", latestQuote);
    stamp("Quote saved", "Piece 2 § save");
    await sleep(1200);

    const deliverySection = page.locator(".nexops-quote-panel").filter({ has: page.getByRole("heading", { name: "Delivery" }) }).last();
    await deliverySection.scrollIntoViewIfNeeded();
    await deliverySection.locator("select").first().selectOption("mark_sent");
    await deliverySection.getByRole("button", { name: "Send quote" }).click();
    await page.waitForFunction(() => document.body.innerText.includes("/portal/quotes/"));
    const portalText = (await deliverySection.locator("small").last().textContent())?.trim();
    const portalUrl = normalizePortalUrl(
      portalText?.startsWith("http")
        ? portalText
        : portalText?.startsWith("/")
          ? `${baseWeb}${portalText}`
          : null
    );
    if (!portalUrl) {
      throw new Error("Portal URL did not appear after send.");
    }
    const savedQuote = await latestQuote();
    stamp("Quote marked sent and portal link generated", "Piece 2 § send", savedQuote.number ?? savedQuote.id);
    await sleep(1800);
    await maybeShot(page, "quote-sent");

    await writeState({
      scenario,
      requestId: request.id,
      quoteId: savedQuote.id,
      quoteNumber: savedQuote.number,
      quoteTitle: savedQuote.title,
      portalUrl,
      clientId: savedQuote.clientId
    });
    await writeMarkers({ statePath, portalUrl });
  } finally {
    videoFiles = await finalizeVideo(browser, context, video, "01-request-to-quote");
    if (videoFiles) {
      await writeMarkers({ statePath, videoFiles });
    }
  }
}

async function quoteToJob() {
  const state = await readState();
  const { browser, context, page, video } = await newVideoPage();
  let videoFiles = null;
  try {
    await page.goto(state.portalUrl, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Approve quote" }).waitFor();
    const approveForm = page.locator("#approve-form");
    stamp("Client-facing quote approval page opened", "Piece 2 § portal");
    await sleep(1200);
    await maybeShot(page, "portal-open");

    await approveForm.locator('input[name="customerName"]').fill(state.scenario.clientName);
    await page.locator("#signature-canvas").evaluate((canvasElement) => {
      const canvas = canvasElement;
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Canvas context unavailable.");
      }
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.lineWidth = 2;
      context.lineCap = "round";
      context.strokeStyle = "#0b5860";
      context.beginPath();
      context.moveTo(60, 110);
      context.lineTo(170, 55);
      context.lineTo(265, 125);
      context.lineTo(380, 65);
      context.stroke();
      const hiddenInput = document.querySelector('#approve-form input[name="drawnDataUrl"]');
      if (!(hiddenInput instanceof HTMLInputElement)) {
        throw new Error("Drawn signature field unavailable.");
      }
      hiddenInput.value = canvas.toDataURL("image/png");
    });
    await approveForm.locator('input[name="cardholderName"]').fill(state.scenario.clientName);
    await approveForm.locator('input[name="cardBrand"]').fill("Visa");
    await approveForm.locator('input[name="cardLast4"]').fill("4242");
    await approveForm.locator('input[name="cardOnFileAuthorized"]').check();
    stamp("Drawn signature and deposit/card details entered", "Piece 2 § approval");
    await sleep(1200);

    await page.getByRole("button", { name: "Approve quote" }).click();
    await page.getByText("Approved. The office can move this into work now.").waitFor();
    const approvedQuote = await poll("approved quote status", async () => {
      const quote = await latestQuote();
      return quote?.status === "approved" ? quote : null;
    });
    stamp("Client approval completed", "Piece 2 § approval", approvedQuote.number ?? approvedQuote.id);
    await sleep(1600);
    await maybeShot(page, "portal-approved");

    await page.goto(`${baseWeb}/nexops/quotes`, { waitUntil: "networkidle" });
    await page.locator(".nexops-request-row-button").filter({ hasText: approvedQuote.number ?? approvedQuote.title }).first().click();
    await page.getByText("Approved").first().waitFor();
    stamp("Approved quote visible in NexOps", "Piece 2 § status");
    await sleep(1000);

    await page.getByRole("button", { name: "Convert to job" }).click();
    const job = await poll("converted job", latestJob);
    stamp("Quote converted to job", "Pieces 2-3 handoff", job.number ?? job.id);
    await sleep(1000);

    await page.goto(`${baseWeb}/nexops/jobs`, { waitUntil: "networkidle" });
    await page.locator(".nexops-jobs-list-item").filter({ hasText: job.title }).first().click();
    await page.getByRole("heading", { name: job.title }).waitFor();
    await page.getByText("Unscheduled").first().waitFor();
    stamp("Job landed as Unscheduled", "Piece 3 § status");
    await sleep(1200);
    await maybeShot(page, "job-unscheduled");

    const startValue = localDateTimeInput(2, 10, 0);
    const endValue = localDateTimeInput(2, 13, 0);
    const visitForm = page.locator('form.nexops-jobs-form.inline');
    await visitForm.locator('input[placeholder="Visit title"]').fill(state.scenario.visitTitle);
    await visitForm.locator('input[type="datetime-local"]').nth(0).fill(startValue);
    await visitForm.locator('input[type="datetime-local"]').nth(1).fill(endValue);
    await visitForm.getByRole("button", { name: "Book visit" }).click();
    await page.waitForFunction(() => document.body.innerText.includes("visit reminder records queued."));
    stamp("Visit scheduled", "Piece 3 § scheduling");
    await sleep(1000);

    const remindersSection = page.getByRole("heading", { name: "Reminders and alerts" });
    await remindersSection.scrollIntoViewIfNeeded();
    stamp("Reminder records visible", "Piece 3 § reminders", "Current UI shows queued reminder records, not the full email/SMS body text.");
    await sleep(1600);
    await maybeShot(page, "job-reminders");

    await page.getByRole("button", { name: "Complete" }).click();
    await page.waitForFunction(() => document.body.innerText.includes("Owner or office admin must close, invoice, or both."));
    const jobDetail = await poll("job action alert after visit complete", async () => {
      const detail = await apiGet(`/api/crm/jobs/${encodeURIComponent(job.id)}?tenantId=aquatrace`);
      return detail?.job?.reminders?.actionAlert ? detail : null;
    });
    stamp("Visit completed and admin review alert fired", "Piece 3 § close/invoice gate", jobDetail.job.reminders.actionAlert.note);
    await sleep(1600);
    await maybeShot(page, "job-action-alert");

    await writeState({
      ...state,
      jobId: job.id,
      jobNumber: job.number,
      jobTitle: job.title,
      visitStart: startValue,
      visitEnd: endValue
    });
    await writeMarkers({ statePath });
  } finally {
    videoFiles = await finalizeVideo(browser, context, video, "02-quote-to-job");
    if (videoFiles) {
      await writeMarkers({ statePath, videoFiles });
    }
  }
}

async function jobToPayment() {
  const state = await readState();
  const { browser, context, page, video } = await newVideoPage();
  let videoFiles = null;
  try {
    await page.goto(`${baseWeb}/nexops/jobs`, { waitUntil: "networkidle" });
    await page.locator(".nexops-jobs-list-item").filter({ hasText: state.jobTitle }).first().click();
    await page.getByRole("heading", { name: state.jobTitle }).waitFor();
    stamp("Job reopened for closeout", "Piece 5 § job close");
    await sleep(900);

    await page.getByRole("button", { name: "Close and Invoice" }).click();
    const invoice = await poll("created invoice", latestInvoice);
    stamp("Close and Invoice created draft invoice", "Piece 5 § close/invoice", invoice.number ?? invoice.id);
    await sleep(1200);

    await page.goto(`${baseWeb}/nexops/invoices`, { waitUntil: "networkidle" });
    await page.locator(".nexops-request-row-button").filter({ hasText: invoice.number ?? invoice.title }).first().click();
    await page.getByRole("heading", { name: invoice.number ?? invoice.id }).waitFor();
    stamp("Invoice detail opened", "Piece 5 § invoice draft");
    await sleep(900);

    const draftEditor = page.locator(".nexops-quote-panel").filter({ has: page.getByRole("heading", { name: "Draft invoice editor" }) }).first();
    await draftEditor.scrollIntoViewIfNeeded();
    const titleInput = draftEditor.locator('input').first();
    if (await titleInput.isEnabled()) {
      await titleInput.fill(`${invoice.title} final`);
    await draftEditor.locator('textarea').first().fill("Final invoice adjusted before send after pressure test review.");
    await page.getByRole("button", { name: "Save invoice" }).click();
    stamp("Invoice draft edited before send", "Piece 5 § invoice draft");
    await sleep(1200);
      await maybeShot(page, "invoice-edited");
    } else {
      stamp("Rough edge: invoice draft editor locked", "Piece 5 Â§ invoice draft", "Deposit carryover moved the invoice out of draft immediately, so the pre-send edit step is unavailable in the current build.");
      await sleep(1200);
      await maybeShot(page, "invoice-editor-locked");
    }

    const sendPanel = page.locator(".nexops-quote-panel").filter({ has: page.getByRole("heading", { name: "Send invoice" }) }).first();
    await sendPanel.scrollIntoViewIfNeeded();
    await sendPanel.locator('label:has-text("Mode") select').selectOption("mark_sent");
    await sendPanel.locator('label:has-text("Subject") input').fill("Leak detection invoice ready for payment");
    await page.getByRole("button", { name: "Send invoice" }).click();
    await page.waitForFunction(() => document.body.innerText.toLowerCase().includes("awaiting payment") || document.body.innerText.toLowerCase().includes("sent"));
    stamp("Invoice sent via mark-sent path", "Piece 5 § send", "Local comms rail is unconfigured, so this segment uses the built-in mark-sent delivery mode.");
    await sleep(1400);

    const collectPanel = page.locator(".nexops-quote-panel").filter({ has: page.getByRole("heading", { name: "Collect payment" }) }).first();
    await collectPanel.scrollIntoViewIfNeeded();
    const savedCardSelect = collectPanel.locator('label.nexops-field:has(span:text-is("Saved card")) select');
    const optionValues = await savedCardSelect.locator("option").evaluateAll((options) => options.map((option) => option.getAttribute("value") ?? ""));
    const realCardValue = optionValues.find((value) => value);
    if (!realCardValue) {
      throw new Error("No saved card was available on the invoice after quote approval.");
    }
    await savedCardSelect.selectOption(realCardValue);
    await page.getByRole("button", { name: "Collect payment" }).click();
    const paidInvoice = await poll("paid invoice", async () => {
      const latest = await latestInvoice();
      return latest?.status === "paid" ? latest : null;
    });
    stamp("Saved card reused for invoice payment", "Pieces 4-5 ledger rail", paidInvoice.number ?? paidInvoice.id);
    await sleep(1600);
    await maybeShot(page, "invoice-paid");

    const receiptPanel = page.locator(".nexops-quote-panel").filter({ has: page.getByRole("heading", { name: "Receipt review" }) }).first();
    await receiptPanel.scrollIntoViewIfNeeded();
    const quotePdfAttachment = receiptPanel.getByLabel("Quote PDF");
    if (await quotePdfAttachment.count()) {
      await quotePdfAttachment.uncheck();
    }
    const otherFilesAttachment = receiptPanel.getByLabel("Other job files");
    if (await otherFilesAttachment.count()) {
      await otherFilesAttachment.uncheck();
    }
    await receiptPanel.locator('label:has-text("Subject") input').fill(state.scenario.receiptSubject);
    await page.getByRole("button", { name: "Save receipt review" }).click();
    await page.getByRole("button", { name: "Send receipt" }).click();
    await sleep(1800);
    const receiptDetail = await apiGet(`/api/crm/invoices/${encodeURIComponent(invoice.id)}?tenantId=aquatrace`);
    const latestReceiptReview = receiptDetail.receiptReviews?.[0];
    if (latestReceiptReview?.status === "sent") {
    stamp("Receipt review sent with field report and job photos", "Piece 5 § receipt review");
    await sleep(1500);
    await maybeShot(page, "receipt-review-sent");
    } else {
      stamp("Rough edge: receipt review blocked locally", "Piece 5 Â§ receipt review", "Receipt review stayed ready_to_send because local email/SMS delivery is not configured on this machine.");
      await maybeShot(page, "receipt-review-blocked");
    }

    await page.goto(`${baseWeb}/nexops/payments`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: paidInvoice.number ?? paidInvoice.id }).waitFor();
    stamp("Payments workspace shows the paid invoice", "Piece 4-5 payment history");
    await sleep(1200);

    await page.goto(`${baseWeb}/nexops/clients`, { waitUntil: "networkidle" });
    await page.locator("button").filter({ hasText: state.scenario.clientName }).first().click();
    await page.getByRole("heading", { name: "Work overview" }).waitFor();
    stamp("Client rollup reflects quote, job, and invoice linkage", "Piece 1-5 rollup", "Current client surface shows work counts and links, not a richer billing ledger timeline yet.");
    await sleep(1800);
    await maybeShot(page, "client-rollup");

    await writeState({
      ...state,
      invoiceId: paidInvoice.id,
      invoiceNumber: paidInvoice.number,
      finalInvoiceStatus: paidInvoice.status
    });
    await writeMarkers({ statePath });
  } finally {
    videoFiles = await finalizeVideo(browser, context, video, "03-job-to-payment");
    if (videoFiles) {
      await writeMarkers({ statePath, videoFiles });
    }
  }
}

await ensureDirs();

if (segment === "request-to-quote") {
  await requestToQuote();
} else if (segment === "quote-to-job") {
  await quoteToJob();
} else {
  await jobToPayment();
}
