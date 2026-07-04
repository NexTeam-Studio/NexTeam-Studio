import {
  createAdminTokenMinter,
  resolveFirebaseWebConfig,
  signInWithCustomTokenRest,
} from "./support/liveProofHelpers.mjs";

const firebaseConfig = resolveFirebaseWebConfig();

async function readDocumentViaFirestoreRest({ idToken, projectId, path }) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return {
    ok: response.ok,
    status: response.status,
    path,
    body: json,
    text,
  };
}

async function main() {
  const minter = createAdminTokenMinter();

  try {
    const customToken = await minter.mint(`live-proof-${Date.now()}`, {
      tenantId: "nexteam-studio",
    });

    const session = await signInWithCustomTokenRest({
      apiKey: firebaseConfig.apiKey,
      token: customToken,
    });

    const sameTenant = await readDocumentViaFirestoreRest({
      idToken: session.idToken,
      projectId: firebaseConfig.projectId,
      path: "tenants/nexteam-studio",
    });
    const crossTenant = await readDocumentViaFirestoreRest({
      idToken: session.idToken,
      projectId: firebaseConfig.projectId,
      path: "tenants/aquatrace",
    });

    const result = {
      ok:
        sameTenant.ok === true &&
        sameTenant.status === 200 &&
        crossTenant.ok === false &&
        crossTenant.status === 403 &&
        /PERMISSION_DENIED|Missing or insufficient permissions/i.test(crossTenant.text || ""),
      sameTenant,
      crossTenant,
    };

    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) {
      process.exitCode = 1;
    }
  } finally {
    await minter.dispose().catch(() => {});
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
