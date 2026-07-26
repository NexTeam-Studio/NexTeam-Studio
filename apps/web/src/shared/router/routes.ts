export type AppRoute = "ops-workspace" | "platform";

export function resolveAppRoute(pathname: string): AppRoute {
  return pathname.startsWith("/platform") ? "platform" : "ops-workspace";
}
