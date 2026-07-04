import {
  createOperatorProofSession,
  fetchJson,
  requireEnv,
  resolveBaseUrl,
  resolveOperatorProofIdentity,
} from "./support/liveProofHelpers.mjs";

const baseUrl = resolveBaseUrl();
const operatorIdentity = resolveOperatorProofIdentity();
const targetTenantId = requireEnv("MISSION_CONTROL_TEST_TENANT_ID", "aquatrace");

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const session = await createOperatorProofSession({ identity: operatorIdentity });
  const idToken = session.idToken;

  try {
    const fastQuestion = "Who's the customer at 237 Camp Mikell Court in Toccoa Georgia?";
    const fastQuestionVariant = "Can you tell me who the client is at 237 Camp Mikell Court in Toccoa, Georgia?";
    const workQuestion = "What are the total pool gallons in the report for Camp Mikell in Toccoa GA?";
    const workQuestionVariant = "Open the Camp Mikell checklist and pull the total gallons.";

    const fast = await fetchJson(`${baseUrl}/api/internal/mission-control/dispatch`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tenantId: targetTenantId,
        question: fastQuestion,
      }),
    });

    const work = await fetchJson(`${baseUrl}/api/internal/mission-control/dispatch`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tenantId: targetTenantId,
        question: workQuestion,
      }),
    });

    const fastVariant = await fetchJson(`${baseUrl}/api/internal/mission-control/dispatch`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tenantId: targetTenantId,
        question: fastQuestionVariant,
      }),
    });

    const workVariant = await fetchJson(`${baseUrl}/api/internal/mission-control/dispatch`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tenantId: targetTenantId,
        question: workQuestionVariant,
      }),
    });

    let polled = null;
    if (work.ok && work.json?.workItemId) {
      for (let attempt = 0; attempt < 30; attempt += 1) {
        await wait(1000);
        polled = await fetchJson(`${baseUrl}/api/internal/mission-control/work-items/${encodeURIComponent(work.json.workItemId)}`, {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        });
        if (polled.json?.workItem?.status === "completed" || polled.json?.workItem?.status === "error") {
          break;
        }
      }
    }

    const result = {
      ok:
        fast.ok &&
        fast.json?.lane === "fast" &&
        typeof fast.json?.result?.answerText === "string" &&
        fast.json.result.answerText.includes("MISSION CONTROL FAST LOOKUP") &&
        work.ok &&
        work.json?.lane === "work" &&
        work.json?.acknowledged === true &&
        typeof work.json?.acknowledgedText === "string" &&
        fastVariant.ok &&
        fastVariant.json?.lane === "fast" &&
        String(fastVariant.json?.result?.answerText || "").includes("MISSION CONTROL FAST LOOKUP") &&
        workVariant.ok &&
        workVariant.json?.lane === "work" &&
        workVariant.json?.acknowledged === true &&
        polled?.ok === true &&
        polled?.json?.workItem?.status === "completed" &&
        String(polled?.json?.workItem?.result?.answerText || "").includes("101,000 Gallons"),
      baseUrl,
      authMode: session.mode,
      fast,
      work,
      polled,
    };

    console.log(
      JSON.stringify(
        {
          ok: result.ok,
          authMode: result.authMode,
          baseUrl: result.baseUrl,
          fast: {
            status: fast.status,
            body: fast.json || fast.text,
          },
          work: {
            status: work.status,
            body: work.json || work.text,
          },
          fastVariant: {
            status: fastVariant.status,
            body: fastVariant.json || fastVariant.text,
          },
          workVariant: {
            status: workVariant.status,
            body: workVariant.json || workVariant.text,
          },
          polled: polled
            ? {
                status: polled.status,
                body: polled.json || polled.text,
              }
            : null,
        },
        null,
        2
      )
    );

    if (!result.ok) {
      process.exitCode = 1;
    }
  } finally {
    await session.dispose();
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
