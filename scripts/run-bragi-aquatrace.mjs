import { readFileSync } from "fs";
import { executeBragiWordpressDraft } from "../src/features/missioncontrol/services/bragiWordpressService.js";

const soul = readFileSync("docs/BRAGI_SOUL.md", "utf8");
if (!soul.includes("## Locked Build Order") || !soul.includes("## First Proof of Life")) {
  throw new Error("BRAGI_SOUL.md is missing required governing sections.");
}

const applicationPassword = readFileSync(
  "docs/internal/clawdia/reference/aquatrace/aquatrace-wordpress-application-password.txt",
  "utf8"
).match(/Password\s*\r?\n([^\r\n]+)/i)?.[1]?.trim();

const editorUsername = readFileSync(
  "docs/internal/clawdia/reference/aquatrace/aquatrace-wordpress-editor-login.txt",
  "utf8"
).match(/Username\s*\r?\n([^\r\n]+)/i)?.[1]?.trim();

const editorPassword = readFileSync(
  "docs/internal/clawdia/reference/aquatrace/aquatrace-wordpress-editor-login.txt",
  "utf8"
).match(/Password\s*\r?\n([^\r\n]+)/i)?.[1]?.trim();

const payload = {
  title: "Bragi Proof of Life - Why a Pool Leak That Seems to Stop Is Still a Problem",
  slug: `bragi-proof-of-life-pool-leak-${new Date().toISOString().slice(0, 10)}`,
  excerpt: "A pool leak that seems to stop can still be active. Temporary debris can block the leak until pressure or temperature shifts change the flow again.",
  content: `<p>If a pool leak seems to stop on its own, that does not mean the problem is gone.</p>
<p>In many pools, dirt, leaves, plaster dust, or small debris can temporarily plug a crack or penetration point. The leak slows down for a while, then starts again when conditions change.</p>
<p>Aquatrace helps pool owners confirm whether they are dealing with normal evaporation or a real leak that still needs to be located and repaired.</p>
<p>If your water loss pattern changed suddenly, it is worth getting the pool inspected before the leak opens back up and wastes more water.</p>`,
  commentStatus: "closed",
  pingStatus: "closed",
  yoast: {
    focusKeyphrase: "my pool leak seems to have stopped",
    seoTitle: "My Pool Leak Seems to Have Stopped - Should I Still Get It Inspected? | Aquatrace",
    metaDescription: "If your pool leak seems to have stopped on its own, do not cancel that inspection. Debris can temporarily plug a leak the same way a stopper seals a drain - and when it shifts, the water loss comes right back.",
    socialTitle: "Your Pool Leak \"Stopped\" - But It Probably Didn't",
    socialDescription: "Dirt, silt, and leaves can seal a leaking pool penetration just like a bathtub stopper. The leak is not gone - it is covered. Here is what is really happening and what to do before you cancel your inspection.",
  },
  credentials: {
    siteUrl: "https://aquatraceleak.com",
    apiUsername: editorUsername,
    apiPassword: applicationPassword,
    editorUsername,
    editorPassword,
  },
};

const result = await executeBragiWordpressDraft(payload);
console.log(JSON.stringify(result, null, 2));
