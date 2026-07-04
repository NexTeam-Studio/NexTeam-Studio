import { fetchJson, requireEnv, resolveBaseUrl } from "./support/liveProofHelpers.mjs";

const baseUrl = resolveBaseUrl();
const toAddress = requireEnv("NEXTEAM_TEST_EMAIL");

async function main() {
  const subject = `NexTeam live proof ${new Date().toISOString()}`;
  const html = `<p>NexTeam live proof email for ${new Date().toISOString()}.</p>`;
  const response = await fetchJson(`${baseUrl}/api/njord/send-test-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      campaignId: `live-proof-${Date.now()}`,
      subject,
      html,
      toAddress,
    }),
  });

  const result = {
    ok: response.ok && response.json?.ok === true && Boolean(response.json?.resendId),
    baseUrl,
    status: response.status,
    body: response.json || response.text,
    note: "Mailbox render/visible delivery must be confirmed in the inbox itself.",
  };

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
