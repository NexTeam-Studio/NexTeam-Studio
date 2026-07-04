import {
  createOperatorProofSession,
  fetchJson,
  resolveBaseUrl,
  resolveOperatorProofIdentity,
} from "./support/liveProofHelpers.mjs";

const baseUrl = resolveBaseUrl();
const operatorIdentity = resolveOperatorProofIdentity();
const requestedTenantId = operatorIdentity.tenantId;

async function main() {
  const unauthenticatedMe = await fetchJson(`${baseUrl}/api/internal/firebase-auth/me`);

  const session = await createOperatorProofSession();
  const idToken = session.idToken;

  try {
    const bootstrap = await fetchJson(`${baseUrl}/api/internal/firebase-auth/tenant-bootstrap`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tenantId: requestedTenantId,
      }),
    });

    const authenticatedMe = await fetchJson(`${baseUrl}/api/internal/firebase-auth/me`, {
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    });

    const result = {
      ok:
        unauthenticatedMe.status === 401 &&
        bootstrap.ok === true &&
        authenticatedMe.ok === true &&
        authenticatedMe.json?.claims?.role === "platform_operator",
      baseUrl,
      authMode: session.mode,
      unauthenticatedMe: {
        status: unauthenticatedMe.status,
        body: unauthenticatedMe.json || unauthenticatedMe.text,
      },
      bootstrap: {
        status: bootstrap.status,
        body: bootstrap.json || bootstrap.text,
      },
      authenticatedMe: {
        status: authenticatedMe.status,
        body: authenticatedMe.json || authenticatedMe.text,
      },
    };

    console.log(JSON.stringify(result, null, 2));
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
