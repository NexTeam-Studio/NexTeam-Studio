import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GoogleAuth } from "google-auth-library";

function normalizeText(value = "") {
  return String(value || "").trim();
}

function resolveProjectId() {
  const projectId = normalizeText(
    process.env.FIREBASE_ADMIN_PROJECT_ID ||
      process.env.VITE_FIREBASE_PROJECT_ID ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.GCLOUD_PROJECT
  );

  if (!projectId) {
    throw new Error(
      "Missing Firebase project id. Set FIREBASE_ADMIN_PROJECT_ID, VITE_FIREBASE_PROJECT_ID, GOOGLE_CLOUD_PROJECT, or GCLOUD_PROJECT."
    );
  }

  return projectId;
}

function resolveRulesPath() {
  return join(process.cwd(), "firestore.rules");
}

async function main() {
  const projectId = resolveProjectId();
  const projectName = `projects/${projectId}`;
  const releaseName = `${projectName}/releases/cloud.firestore`;
  const rules = readFileSync(resolveRulesPath(), "utf8");

  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });

  const authClient = await auth.getClient();
  const accessToken = await authClient.getAccessToken();
  const bearerToken = normalizeText(accessToken?.token || accessToken);
  if (!bearerToken) {
    throw new Error("Could not acquire a Google access token for the Firebase Rules API.");
  }

  async function fetchRulesJson(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const err = new Error(data?.error?.message || `Rules API request failed with status ${response.status}.`);
      err.response = { data };
      throw err;
    }

    return data;
  }

  const currentRelease = await fetchRulesJson(`https://firebaserules.googleapis.com/v1/${releaseName}`);
  const createdRuleset = await fetchRulesJson(`https://firebaserules.googleapis.com/v1/${projectName}/rulesets`, {
    method: "POST",
    body: JSON.stringify({
      source: {
        files: [
          {
            name: "firestore.rules",
            content: rules,
          },
        ],
      },
    }),
  });

  const nextRulesetName = normalizeText(createdRuleset?.name);
  if (!nextRulesetName) {
    throw new Error("Ruleset creation did not return a ruleset name.");
  }

  const updatedRelease = await fetchRulesJson(`https://firebaserules.googleapis.com/v1/${releaseName}`, {
    method: "PATCH",
    body: JSON.stringify({
      release: {
        name: releaseName,
        rulesetName: nextRulesetName,
      },
      updateMask: "rulesetName",
    }),
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        projectId,
        releaseName,
        previousRulesetName: currentRelease?.rulesetName || null,
        nextRulesetName,
        updateTime: updatedRelease?.updateTime || null,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: String(error?.message || error),
        detail: error?.response?.data || null,
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
