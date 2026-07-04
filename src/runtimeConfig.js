function readViteEnv(name) {
  if (typeof import.meta !== "undefined" && import.meta?.env && name in import.meta.env) {
    return import.meta.env[name];
  }
  return undefined;
}

function readWindowRuntimeEnv(name) {
  if (typeof window !== "undefined" && window.__NEXTEAM_RUNTIME_CONFIG__) {
    return window.__NEXTEAM_RUNTIME_CONFIG__[name];
  }
  return undefined;
}

export function getRuntimeConfigValue(name, fallback = "") {
  const runtimeValue = readWindowRuntimeEnv(name);
  if (runtimeValue !== undefined && runtimeValue !== null && String(runtimeValue).trim() !== "") {
    return runtimeValue;
  }

  const viteValue = readViteEnv(name);
  if (viteValue !== undefined && viteValue !== null && String(viteValue).trim() !== "") {
    return viteValue;
  }

  return fallback;
}
