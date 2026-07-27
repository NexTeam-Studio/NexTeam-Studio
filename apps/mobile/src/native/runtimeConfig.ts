import Constants from "expo-constants";
import { mobileRuntimeConfigSchema, type MobileRuntimeConfig } from "./captureModels.js";

type RuntimeResponse = {
  ok?: boolean;
  firebase?: Record<string, unknown>;
  firebaseConfigured?: unknown;
  authRequired?: unknown;
};

type ExpoConstantsShape = {
  expoConfig?: {
    extra?: {
      apiBaseUrl?: string;
      tenantId?: string;
    };
    hostUri?: string;
  } | null;
  manifest2?: {
    extra?: {
      expoClient?: {
        hostUri?: string;
      };
    };
  } | null;
  manifest?: {
    debuggerHost?: string;
  } | null;
};

const expoConstants = Constants as unknown as ExpoConstantsShape;

export function mobileApiBaseUrl(): string {
  const extra = (expoConstants.expoConfig?.extra ?? {}) as { apiBaseUrl?: string };
  const configured = extra.apiBaseUrl?.trim() || "http://127.0.0.1:3000";
  if (!/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(configured)) {
    return configured;
  }
  const rawHostUri = expoConstants.expoConfig?.hostUri
    ?? expoConstants.manifest2?.extra?.expoClient?.hostUri
    ?? expoConstants.manifest?.debuggerHost;
  const host = rawHostUri?.split(":")[0]?.trim();
  return host ? `http://${host}:3000` : configured;
}

export function mobileTenantId(): string {
  const extra = (expoConstants.expoConfig?.extra ?? {}) as { tenantId?: string };
  const tenantId = extra.tenantId?.trim();
  if (!tenantId) {
    throw new Error("Mobile tenantId must be configured in the Expo runtime.");
  }
  return tenantId;
}

export async function fetchMobileRuntimeConfig(): Promise<MobileRuntimeConfig> {
  const apiBaseUrl = mobileApiBaseUrl();
  const tenantId = mobileTenantId();
  const response = await fetch(`${apiBaseUrl}/api/public/runtime-config`);
  const body = await response.json() as RuntimeResponse;
  if (!response.ok || body.ok === false) {
    throw new Error("Mobile runtime config could not be loaded.");
  }
  return mobileRuntimeConfigSchema.parse({
    apiBaseUrl,
    tenantId,
    authRequired: body.authRequired === true,
    firebaseConfigured: body.firebaseConfigured === true,
    firebase: {
      apiKey: String(body.firebase?.apiKey ?? ""),
      authDomain: String(body.firebase?.authDomain ?? ""),
      projectId: String(body.firebase?.projectId ?? ""),
      storageBucket: String(body.firebase?.storageBucket ?? ""),
      messagingSenderId: String(body.firebase?.messagingSenderId ?? ""),
      appId: String(body.firebase?.appId ?? "")
    }
  });
}
