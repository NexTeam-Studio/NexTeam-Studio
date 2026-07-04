import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../src/firebase.js";

function normalizeText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function splitLines(value) {
  return normalizeText(value)
    .split("\n")
    .map(function (line) {
      return line.trim();
    })
    .filter(Boolean);
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function markdownBulletList(items, fallback) {
  var safeItems = items.length ? items : [fallback];
  return safeItems
    .map(function (item) {
      return "- " + item;
    })
    .join("\n");
}

function markdownTableRows(items, labelFallback) {
  var safeItems = items.length ? items : [labelFallback];
  return safeItems
    .map(function (item, index) {
      var clean = item && item.trim().length ? item.trim() : labelFallback;
      var key =
        clean.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") ||
        "item_" + (index + 1);
      return "| " + key + " | text | " + clean + " |";
    })
    .join("\n");
}

function inferDomainSlug(domain) {
  var parts = String(domain || "")
    .split("/")
    .map(function (part) {
      return part.trim();
    })
    .filter(Boolean);

  return slugify(parts[parts.length - 1] || "general");
}

function buildWorkflow(mainTasks) {
  if (mainTasks.length) {
    return mainTasks
      .map(function (task, index) {
        return index + 1 + ". " + task;
      })
      .join("\n");
  }

  return [
    "1. Receive the assigned request or context",
    "2. Review the available details and identify missing information",
    "3. Produce a practical draft output for human review",
    "4. Stop and wait for approval or next instruction"
  ].join("\n");
}

function buildErrorHandling(agentName, notes) {
  if (notes.length) {
    return (
      "If the request is incomplete, conflicting, or too vague, " +
      agentName +
      " returns a clarification-needed response instead of guessing."
    );
  }

  return "If the request is incomplete, conflicting, or too vague, this agent returns a clarification-needed response instead of guessing.";
}

function getToday() {
  var now = new Date();
  var year = now.getFullYear();
  var month = String(now.getMonth() + 1).padStart(2, "0");
  var day = String(now.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

function getFormData() {
  return {
    agentName: normalizeText(document.getElementById("agentName").value) || "[Needs clarification]",
    domain: normalizeText(document.getElementById("domain").value) || "[Needs clarification]",
    mission: normalizeText(document.getElementById("mission").value) || "[Needs clarification]",
    mainTasks: splitLines(document.getElementById("mainTasks").value),
    inputs: splitLines(document.getElementById("inputs").value),
    outputs: splitLines(document.getElementById("outputs").value),
    allowedTools: splitLines(document.getElementById("allowedTools").value),
    restrictedActions: splitLines(document.getElementById("restrictedActions").value),
    approvalTriggers: splitLines(document.getElementById("approvalTriggers").value),
    stopConditions: splitLines(document.getElementById("stopConditions").value),
    successCriteria: splitLines(document.getElementById("successCriteria").value),
    notes: splitLines(document.getElementById("notes").value)
  };
}

function buildGeneratedAgent() {
  var form = getFormData();
  var domainSlug = inferDomainSlug(form.domain) || "general";
  var nameSlug = slugify(form.agentName) || "unnamed-agent";
  var agentId = crypto.randomUUID ? crypto.randomUUID() : "agt_" + domainSlug + "_" + nameSlug + "_" + Date.now();
  var specFileName =
    "docs/AGENT_" +
    String(form.agentName)
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") +
    ".md";
  var today = getToday();
  var workflow = buildWorkflow(form.mainTasks);
  var errorHandling = buildErrorHandling(form.agentName, form.notes);

  var generatedSpec = [
    "# AGENT_" +
      String(form.agentName)
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "") +
      ".md",
    "> Generated child-agent draft from Agent Architect Studio.",
    "",
    "## 1. Agent Name",
    form.agentName,
    "",
    "## 2. Agent ID",
    agentId,
    "",
    "## 3. Parent Agent",
    "Agent Architect",
    "",
    "## 4. Mission",
    form.mission,
    "",
    "## 5. Domain",
    form.domain,
    "",
    "## 6. Inputs",
    "| Input | Type | Description |",
    "|---|---|---|",
    markdownTableRows(form.inputs, "[Needs clarification]"),
    "",
    "## 7. Outputs",
    "| Output | Format | Description |",
    "|---|---|---|",
    markdownTableRows(form.outputs, "[Needs clarification]"),
    "",
    "## 8. Allowed Tools",
    markdownBulletList(form.allowedTools, "[Needs clarification]"),
    "",
    "## 9. Restricted Actions",
    markdownBulletList(form.restrictedActions, "[Needs clarification]"),
    "",
    "## 10. Workflow",
    workflow,
    "",
    "## 11. Stop Conditions",
    markdownBulletList(form.stopConditions, "[Needs clarification]"),
    "",
    "## 12. Approval Triggers",
    markdownBulletList(form.approvalTriggers, "[Needs clarification]"),
    "",
    "## 13. Success Criteria",
    markdownBulletList(form.successCriteria, "[Needs clarification]"),
    "",
    "## 14. Error Handling",
    errorHandling,
    "",
    "## 15. Status",
    "defined",
    "",
    "## 16. Version",
    "1.0.0",
    "",
    "## 17. Last Updated",
    today
  ].join("\n");

  var registryRow =
    "| " +
    agentId +
    " | " +
    form.agentName +
    " | defined | Agent Architect | " +
    form.domain +
    " | " +
    specFileName +
    " | " +
    today +
    " |";

  return {
    agentName: form.agentName,
    agentId: agentId,
    domain: form.domain,
    mission: form.mission,
    generatedSpec: generatedSpec,
    registryRow: registryRow
  };
}

var generateSpecButton = document.getElementById("generateSpecButton");
var saveSpecButton = document.getElementById("saveSpecButton");
var specOutput = document.getElementById("specOutput");
var registryOutput = document.getElementById("registryOutput");
var saveStatus = document.getElementById("saveStatus");

var latestGeneratedAgent = null;

function renderStatus(message, type) {
  saveStatus.textContent = message;
  saveStatus.className = "status-message" + (type ? " " + type : "");
  saveStatus.hidden = false;
}

function clearStatus() {
  saveStatus.textContent = "";
  saveStatus.className = "status-message";
  saveStatus.hidden = true;
}

function generateSpec() {
  latestGeneratedAgent = buildGeneratedAgent();
  specOutput.value = latestGeneratedAgent.generatedSpec;
  registryOutput.value = latestGeneratedAgent.registryRow;
  saveSpecButton.hidden = false;
  clearStatus();
}

async function saveSpecToFirestore() {
  if (!latestGeneratedAgent) {
    renderStatus("Generate the agent spec first, then save it to Firestore.", "error");
    return;
  }

  saveSpecButton.disabled = true;
  renderStatus("Saving agent spec to Firestore...", "");

  try {
    var docRef = await addDoc(collection(db, "agentSpecs"), {
      agentName: latestGeneratedAgent.agentName,
      agentId: latestGeneratedAgent.agentId,
      domain: latestGeneratedAgent.domain,
      mission: latestGeneratedAgent.mission,
      generatedSpec: latestGeneratedAgent.generatedSpec,
      createdAt: serverTimestamp()
    });

    renderStatus("Saved to Firestore successfully. Document ID: " + docRef.id, "success");
  } catch (error) {
    var message = error && error.message ? error.message : "Unknown error";
    renderStatus("Could not save the agent spec to Firestore. " + message, "error");
  } finally {
    saveSpecButton.disabled = false;
  }
}

generateSpecButton.addEventListener("click", generateSpec);
saveSpecButton.addEventListener("click", saveSpecToFirestore);

generateSpec();
