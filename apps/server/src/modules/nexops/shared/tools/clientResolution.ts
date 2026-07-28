import { RailError, type Client, type CRMProvider } from "@nexteam/core";

function normalized(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function exactOrStrongClientMatch(clients: Client[], query: string): boolean {
  const needle = normalized(query);
  return !needle || clients.some((client) => {
    const contactValues = (client.contacts ?? []).flatMap((contact) => [
      contact.personName?.firstName,
      contact.personName?.lastName,
      contact.company,
      contact.role,
      ...contact.emails.map((email) => email.value),
      ...contact.phones.map((phone) => phone.value)
    ]);
    const values = [
      client.name,
      client.company ?? "",
      client.personName?.firstName ?? "",
      client.personName?.lastName ?? "",
      ...client.emails,
      ...client.phones,
      ...contactValues
    ].filter((value): value is string => Boolean(value)).map(normalized).filter(Boolean);
    return values.some((value) => value === needle || value.includes(needle));
  });
}

export async function resolveExactClientId(
  provider: CRMProvider,
  clientId: string | undefined,
  clientQuery: string | undefined,
  op: string
): Promise<string> {
  if (clientId) {
    return clientId;
  }
  if (clientQuery?.trim()) {
    const matches = await provider.getClients(clientQuery.trim());
    if (matches.length !== 1 || !exactOrStrongClientMatch(matches, clientQuery.trim())) {
      throw new RailError("I need one exact client match before I can save that. Give me the saved client name or client id.", {
        provider: "native",
        op,
        status: 400
      });
    }
    return matches[0]!.id;
  }
  throw new RailError("A client match is required before I can save that.", { provider: "native", op, status: 400 });
}
