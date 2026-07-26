export type PlatformSubroute = "overview" | "clients" | "quotes" | "jobs" | "settings" | "invoices";

const PLATFORM_PREFIX = "/platform";

export function resolvePlatformSubroute(pathname: string): PlatformSubroute {
  if (!pathname.startsWith(PLATFORM_PREFIX)) {
    return "overview";
  }

  const suffix = pathname.slice(PLATFORM_PREFIX.length).replace(/^\/+/, "");
  const segment = suffix.split("/")[0];

  switch (segment) {
    case "clients":
    case "quotes":
    case "jobs":
    case "settings":
    case "invoices":
      return segment;
    default:
      return "overview";
  }
}
