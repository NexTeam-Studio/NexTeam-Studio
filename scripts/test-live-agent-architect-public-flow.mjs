import { chromium } from "playwright";
import { resolveBaseUrl } from "./support/liveProofHelpers.mjs";

const baseUrl = resolveBaseUrl();

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(45000);

  const result = {
    ok: false,
    baseUrl,
    pageErrors: [],
    consoleErrors: [],
    requestProof: [],
    steps: [],
  };

  page.on("pageerror", (error) => {
    result.pageErrors.push(String(error?.message || error));
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      result.consoleErrors.push(message.text());
    }
  });
  page.on("response", async (response) => {
    const url = response.url();
    if (!url.includes("/api/anthropic/v1/messages")) {
      return;
    }
    let bodyText = "";
    try {
      bodyText = await response.text();
    } catch {
      bodyText = "";
    }
    result.requestProof.push({
      url,
      status: response.status(),
      bodySnippet: bodyText.slice(0, 500),
      modelObserved: /claude-sonnet-4-6/.test(bodyText),
      lowCreditObserved: /credit balance is too low/i.test(bodyText),
    });
  });

  try {
    await page.goto(`${baseUrl}/agent-architect`, { waitUntil: "networkidle" });

    const startButton = page.getByRole("button", { name: /start conversation/i });
    if (await startButton.isVisible().catch(() => false)) {
      await startButton.click();
    }

    const input = page.getByPlaceholder("Tell Nexi about your business or tap the mic");
    await input.fill("Aquatrace Swimming Pool Leak Detection");
    await page.getByRole("button", { name: /send/i }).click();

    const bodyText = await page.locator("body").innerText();

    const successText = page.getByText(/Love it — Aquatrace is a great name!/i);
    const failureText = page.getByText(/Nexi had trouble responding\. Please try again\./i);
    const outcome = await Promise.race([
      successText
        .waitFor({ timeout: 45000 })
        .then(async () => ({
          kind: "success",
          text: await page.locator("body").innerText(),
        })),
      failureText
        .waitFor({ timeout: 45000 })
        .then(async () => ({
          kind: "failure",
          text: await page.locator("body").innerText(),
        })),
    ]);

    result.steps.push({
      step: "public-intake-chat",
      ok:
        outcome.kind === "success" &&
        /Meet Nexi/i.test(outcome.text) &&
        /Aquatrace Swimming Pool Leak Detection/i.test(outcome.text) &&
        /Love it — Aquatrace is a great name!/i.test(outcome.text),
      url: page.url(),
      outcome: outcome.kind,
    });

    if (outcome.kind === "failure") {
      result.blocker = {
        code: "ANTHROPIC_CREDIT_BALANCE_LOW",
        message: "Public Agent Architect reached the live Anthropic route, but the provider rejected the request because the deployed Anthropic API balance is too low.",
      };
    }

    result.ok =
      result.steps.every((entry) => entry.ok) &&
      result.pageErrors.length === 0 &&
      result.consoleErrors.length === 0 &&
      result.requestProof.some((entry) => entry.status === 200) &&
      result.requestProof.some((entry) => entry.modelObserved);
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: String(error?.message || error),
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
