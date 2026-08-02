import type { Address, ApprovalQueueService, Client, Property, Tenant } from "@nexteam/core";
import { parseRequestAddress, sanitizeRequestAddress } from "../../../../../../../shared/addressLocation/requestAddressTools.js";
import type { CreateClientInput } from "./toolSchemas.js";
import type { UpdateClientAddressInput } from "./toolSchemas.js";

export function dedupeClients(clients: Client[]): Client[] {
  const seen = new Set<string>();
  return clients.filter((client) => {
    if (seen.has(client.id)) return false;
    seen.add(client.id);
    return true;
  });
}

export function hasClientSavePhone(input: CreateClientInput): boolean {
  return input.phones.some((phone) => phone.trim().length > 0)
    || (input.contacts ?? []).some((contact) => contact.phones.some((phone) => phone.value.trim().length > 0));
}

export function clientSaveMissingFields(input: CreateClientInput): string[] {
  const missing: string[] = [];
  if (!input.name.trim()) {
    missing.push("name");
  }
  if (!input.address?.trim()) {
    missing.push("address");
  }
  if (!hasClientSavePhone(input)) {
    missing.push("telephone");
  }
  return missing;
}

export function clientSaveClarification(missing: string[]): string {
  const summary = missing.length === 1
    ? missing[0]
    : `${missing.slice(0, -1).join(", ")}, and ${missing.at(-1)}`;
  return `I still need ${summary} before I can save this client. Email is helpful, but it is not required.`;
}

export function queuedClientRecord(tenantId: string, input: CreateClientInput) {
  const parsedAddress = input.address ? parseRequestAddress(input.address) : null;
  return {
    tenantId,
    name: input.name,
    ...(input.company ? { company: input.company } : {}),
    ...(input.personName ? { personName: input.personName } : {}),
    ...(input.displayNamePreference ? { displayNamePreference: input.displayNamePreference } : {}),
    ...(input.billingAddress ? { billingAddress: input.billingAddress } : parsedAddress ? {
      billingAddress: {
        ...parsedAddress,
        country: "USA"
      }
    } : {}),
    ...(input.billingSameAsPrimaryProperty !== undefined ? { billingSameAsPrimaryProperty: input.billingSameAsPrimaryProperty } : {}),
    ...(input.contacts ? { contacts: input.contacts } : {}),
    ...(input.communicationSettings ? { communicationSettings: input.communicationSettings } : {}),
    emails: input.emails,
    phones: input.phones,
    consent: input.consent
  };
}

export function queuedClientPrimaryProperty(
  tenantId: string,
  client: ReturnType<typeof queuedClientRecord>,
  input: CreateClientInput
) {
  const parsedAddress = input.address ? parseRequestAddress(input.address) : null;
  if (!parsedAddress) {
    return undefined;
  }
  return {
    tenantId,
    label: "Primary service address",
    siteName: input.company?.trim() || client.name,
    address: {
      ...parsedAddress,
      country: "USA"
    },
    billingAddressSameAsClient: true
  };
}

export function queuedClientPreviewBody(client: ReturnType<typeof queuedClientRecord>, input: CreateClientInput): string {
  const parsedAddress = input.address ? parseRequestAddress(input.address) : null;
  const contactSummary = (client.contacts ?? []).map((contact) => {
    const person = [contact.personName?.firstName, contact.personName?.lastName].filter(Boolean).join(" ");
    const channels = contact.channelPreference === "both" ? "email + one-way text" : contact.channelPreference;
    return `${person || contact.company || "Contact"}: ${channels}`;
  });
  return [
    `Name: ${client.name}`,
    client.company ? `Company: ${client.company}` : "",
    client.displayNamePreference ? `Display as: ${client.displayNamePreference === "company" ? "company name" : "first and last name"}` : "",
    client.emails.length ? `Email: ${client.emails.join(", ")}` : "Email: not provided",
    client.phones.length ? `Phone: ${client.phones.join(", ")}` : "",
    contactSummary.length ? `Contacts: ${contactSummary.join("; ")}` : "",
    parsedAddress ? `Address: ${parsedAddress.street1}` : "",
    parsedAddress ? `City: ${parsedAddress.city}` : "",
    parsedAddress ? `State: ${parsedAddress.province}` : "",
    parsedAddress?.postalCode ? `ZIP: ${parsedAddress.postalCode}` : "",
    client.billingSameAsPrimaryProperty === false ? "Billing address: separate address on file" : "",
    !parsedAddress && input.address ? `Address: ${sanitizeRequestAddress(input.address)}` : ""
  ].filter(Boolean).join("\n");
}

export async function queueClientCreateApproval(
  tenant: Tenant,
  input: CreateClientInput,
  approvalQueue: ApprovalQueueService
): Promise<{ approval: Awaited<ReturnType<ApprovalQueueService["create"]>>; pendingClient: ReturnType<typeof queuedClientRecord>; addressNote?: string | undefined; writesAreApprovalQueuedOnly: true }> {
  const client = queuedClientRecord(tenant.id, input);
  const primaryProperty = queuedClientPrimaryProperty(tenant.id, client, input);
  const approval = await approvalQueue.create({
    tenantId: tenant.id,
    kind: "client",
    preview: {
      title: `Create client: ${client.name}`,
      body: queuedClientPreviewBody(client, input)
    },
    execute: {
      service: "crm",
      op: "createClient",
      args: {
        tenantId: tenant.id,
        client,
        ...(primaryProperty ? { primaryProperty } : {}),
        ...(input.address ? { addressNote: input.address } : {})
      }
    },
    createdBy: "nexi"
  });
  return {
    approval,
    pendingClient: client,
    addressNote: input.address,
    writesAreApprovalQueuedOnly: true
  };
}

export async function queueClientDeleteApproval(
  tenant: Tenant,
  client: Client,
  approvalQueue: ApprovalQueueService
): Promise<{ approval: Awaited<ReturnType<ApprovalQueueService["create"]>>; writesAreApprovalQueuedOnly: true }> {
  const approval = await approvalQueue.create({
    tenantId: tenant.id,
    kind: "client",
    preview: {
      title: `Delete client: ${client.name}`,
      body: [
        `Client: ${client.name}`,
        "This permanently removes this NexTeam-created client and its saved properties.",
        "Imported client history and any client with linked work cannot be deleted."
      ].join("\n")
    },
    execute: {
      service: "crm",
      op: "deleteClient",
      args: { tenantId: tenant.id, clientId: client.id }
    },
    createdBy: "nexi"
  });
  return { approval, writesAreApprovalQueuedOnly: true };
}

function requestedAddress(changeRequest: string, existing: Address | undefined): Address | undefined {
  const afterAddressLabel = changeRequest.match(/\b(?:address|location|zip|postal(?:\s+code)?)\b\s*(?:to|is|=|:)?\s*([^\n.!?]+(?:[.!?]|$))/i)?.[1]?.trim();
  const parsed = afterAddressLabel ? parseRequestAddress(afterAddressLabel) : null;
  if (parsed) {
    return { ...parsed, country: existing?.country ?? "USA" };
  }
  const postalCode = changeRequest.match(/\b(\d{5}(?:-\d{4})?)\b/)?.[1];
  return postalCode && existing ? { ...existing, postalCode } : undefined;
}

export async function queueClientAddressUpdateApproval(
  tenant: Tenant,
  input: UpdateClientAddressInput,
  client: Client,
  property: Property | undefined,
  approvalQueue: ApprovalQueueService
): Promise<{ approval?: Awaited<ReturnType<ApprovalQueueService["create"]>>; needsClarification?: string; writesAreApprovalQueuedOnly?: true }> {
  const address = requestedAddress(input.changeRequest, property?.address ?? client.billingAddress);
  if (!address) {
    return {
      needsClarification: "Tell me the complete new address, or give me the new ZIP code for the address already on file. I will show the change before saving it."
    };
  }
  const primaryProperty = property ? { ...property, address } : undefined;
  const changes = [
    `Client: ${client.name}`,
    `New address: ${[address.street1, address.city, address.province, address.postalCode].filter(Boolean).join(", ")}`,
    primaryProperty ? `Service property: ${primaryProperty.label ?? primaryProperty.siteName ?? "primary property"}` : "Service property: no property record will be changed"
  ];
  const approval = await approvalQueue.create({
    tenantId: tenant.id,
    kind: "client",
    preview: {
      title: `Update client address: ${client.name}`,
      body: changes.join("\n")
    },
    execute: {
      service: "crm",
      op: "updateClient",
      args: {
        tenantId: tenant.id,
        clientId: client.id,
        billingAddress: address,
        ...(primaryProperty ? { primaryProperty } : {}),
        changeSummary: changes[1]
      }
    },
    createdBy: "nexi"
  });
  return { approval, writesAreApprovalQueuedOnly: true };
}
