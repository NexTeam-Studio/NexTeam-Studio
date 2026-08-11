/**
 * NexCommand deliberately does not treat Firebase's persisted browser session
 * as a fresh platform-console authentication. The short-lived NexCommand
 * session (or the marker produced by a just-completed sign-in) is required
 * before the router may create a server-side NexCommand session.
 */
export function requiresNexCommandReauthentication(input: {
  pathname: string;
  hasFreshAuthentication: boolean;
  hasSession: boolean;
}): boolean {
  const isNexCommand = input.pathname.startsWith("/platform") || input.pathname.startsWith("/nexcommand");
  return isNexCommand && !input.hasFreshAuthentication && !input.hasSession;
}
