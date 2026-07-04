import { chromium } from "playwright";
import {
  createOperatorProofSession,
  resolveBaseUrl,
  resolveFirebaseWebConfig,
  resolveOperatorProofIdentity,
} from "./support/liveProofHelpers.mjs";

const baseUrl = resolveBaseUrl();
const firebaseConfig = resolveFirebaseWebConfig();
const operatorIdentity = resolveOperatorProofIdentity();

async function main() {
  const session = await createOperatorProofSession();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(45000);

  const result = {
    ok: false,
    baseUrl,
    authMode: session.mode,
    pageErrors: [],
    consoleErrors: [],
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

  try {
    await page.goto(`${baseUrl}/admin/sessions`, { waitUntil: "domcontentloaded" });
    if (session.customToken) {
      await page.evaluate(
        async ({ injectedFirebaseConfig, injectedCustomToken }) => {
          const firebaseAppModule = await import("https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js");
          const firebaseAuthModule = await import("https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js");
          const app = firebaseAppModule.getApps().length
            ? firebaseAppModule.getApp()
            : firebaseAppModule.initializeApp(injectedFirebaseConfig);
          const auth = firebaseAuthModule.getAuth(app);
          await firebaseAuthModule.setPersistence(auth, firebaseAuthModule.browserLocalPersistence);
          await firebaseAuthModule.signInWithCustomToken(auth, injectedCustomToken);
          if (typeof auth.authStateReady === "function") {
            await auth.authStateReady();
          }
          await new Promise((resolve) => setTimeout(resolve, 1200));
        },
        {
          injectedFirebaseConfig: firebaseConfig,
          injectedCustomToken: session.customToken,
        }
      );
    } else {
      await page.getByPlaceholder("Operator email").fill(operatorIdentity.email);
      await page.getByPlaceholder("Operator password").fill(operatorIdentity.password);
      await page.getByRole("button", { name: /sign in as operator/i }).click();
    }

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByText(/operator session/i).waitFor({ timeout: 45000 });
    const operatorText = await page.locator("body").innerText();
    result.steps.push({
      step: "operator-session-visible",
      ok:
        /operator session/i.test(operatorText) &&
        /owner@aquatrace\.com/i.test(operatorText) &&
        /role platform_operator/i.test(operatorText),
      url: page.url(),
    });

    await page.getByRole("button", { name: /sign out/i }).click();
    await page.getByText(/operator access/i).waitFor({ timeout: 45000 });
    const signedOutText = await page.locator("body").innerText();
    result.steps.push({
      step: "operator-logout",
      ok:
        /operator access/i.test(signedOutText) &&
        /legacy client-side password fallback is disabled/i.test(signedOutText),
      url: page.url(),
    });

    result.ok =
      result.steps.every((entry) => entry.ok) &&
      result.pageErrors.length === 0 &&
      result.consoleErrors.length === 0;
  } finally {
    await browser.close();
    await session.dispose();
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
