import type { CampaignRepository } from "./repository.js";
import type { AudienceFilter, CampaignContact } from "./schemas.js";

function hasAny(contact: CampaignContact, tags: string[] | undefined): boolean {
  return !tags?.length || tags.some((tag) => contact.tags.includes(tag));
}

function hasAll(contact: CampaignContact, tags: string[] | undefined): boolean {
  return !tags?.length || tags.every((tag) => contact.tags.includes(tag));
}

function hasChannelAddress(contact: CampaignContact, channel: AudienceFilter["channel"]): boolean {
  return channel === "email" ? contact.emails.length > 0 : contact.phones.length > 0;
}

export async function selectAudience(input: {
  repository: CampaignRepository;
  tenantId: string;
  filter: AudienceFilter;
}): Promise<{ contacts: CampaignContact[]; excluded: Array<{ contactId: string; reason: string }> }> {
  const contacts = await input.repository.listContacts(input.tenantId);
  const excluded: Array<{ contactId: string; reason: string }> = [];
  const selected: CampaignContact[] = [];

  for (const contact of contacts) {
    if (input.filter.clientIds?.length && !input.filter.clientIds.includes(contact.id)) {
      continue;
    }
    if (!hasAny(contact, input.filter.tagsAny) || !hasAll(contact, input.filter.tagsAll)) {
      continue;
    }
    if (!hasChannelAddress(contact, input.filter.channel)) {
      excluded.push({ contactId: contact.id, reason: `missing_${input.filter.channel}_address` });
      continue;
    }
    if (input.filter.consentRequired && !contact.consent[input.filter.channel]) {
      excluded.push({ contactId: contact.id, reason: `missing_${input.filter.channel}_consent` });
      continue;
    }
    if (input.filter.excludeSuppressed && await input.repository.isSuppressed(input.tenantId, contact.id, input.filter.channel)) {
      excluded.push({ contactId: contact.id, reason: "suppressed" });
      continue;
    }
    selected.push(contact);
    if (selected.length >= input.filter.maxResults) {
      break;
    }
  }

  return { contacts: selected, excluded };
}
