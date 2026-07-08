import type { Firestore, DocumentData } from "firebase-admin/firestore";
import { generatedSiteSchema, siteLeadSchema, type GeneratedSite, type SiteLead } from "./schemas.js";

export interface SitesRepository {
  saveSite(site: GeneratedSite): Promise<GeneratedSite>;
  getSiteBySlug(tenantId: string, slug: string): Promise<GeneratedSite | null>;
  listSites(tenantId: string): Promise<GeneratedSite[]>;
  saveLead(lead: SiteLead): Promise<SiteLead>;
  listLeads(tenantId: string, slug?: string): Promise<SiteLead[]>;
}

export class InMemorySitesRepository implements SitesRepository {
  private readonly sites = new Map<string, GeneratedSite>();
  private readonly leads = new Map<string, SiteLead>();

  async saveSite(site: GeneratedSite): Promise<GeneratedSite> {
    const parsed = generatedSiteSchema.parse(site) as GeneratedSite;
    this.sites.set(parsed.id, parsed);
    return parsed;
  }

  async getSiteBySlug(tenantId: string, slug: string): Promise<GeneratedSite | null> {
    return Array.from(this.sites.values()).find((site) => site.tenantId === tenantId && site.slug === slug) ?? null;
  }

  async listSites(tenantId: string): Promise<GeneratedSite[]> {
    return Array.from(this.sites.values()).filter((site) => site.tenantId === tenantId);
  }

  async saveLead(lead: SiteLead): Promise<SiteLead> {
    const parsed = siteLeadSchema.parse(lead) as SiteLead;
    this.leads.set(parsed.id, parsed);
    return parsed;
  }

  async listLeads(tenantId: string, slug?: string): Promise<SiteLead[]> {
    return Array.from(this.leads.values())
      .filter((lead) => lead.tenantId === tenantId && (!slug || lead.slug === slug))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }
}

function removeUndefined(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(removeUndefined);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, removeUndefined(entry)])
    );
  }
  return value;
}

function asDocumentData(value: object): DocumentData {
  return removeUndefined(value) as DocumentData;
}

export class FirestoreSitesRepository implements SitesRepository {
  constructor(private readonly db: Firestore) {}

  async saveSite(site: GeneratedSite): Promise<GeneratedSite> {
    const parsed = generatedSiteSchema.parse(site) as GeneratedSite;
    // @tenant-doc:sitePages generatedSiteSchema requires tenantId before write.
    await this.db.collection("sitePages").doc(parsed.id).set(asDocumentData(parsed));
    return parsed;
  }

  async getSiteBySlug(tenantId: string, slug: string): Promise<GeneratedSite | null> {
    const snapshot = await this.db
      .collection("sitePages")
      .where("tenantId", "==", tenantId)
      .where("slug", "==", slug)
      .limit(1)
      .get();
    const doc = snapshot.docs[0];
    return doc ? (generatedSiteSchema.parse(doc.data()) as GeneratedSite) : null;
  }

  async listSites(tenantId: string): Promise<GeneratedSite[]> {
    const snapshot = await this.db.collection("sitePages").where("tenantId", "==", tenantId).get();
    return snapshot.docs.map((doc) => generatedSiteSchema.parse(doc.data()) as GeneratedSite);
  }

  async saveLead(lead: SiteLead): Promise<SiteLead> {
    const parsed = siteLeadSchema.parse(lead) as SiteLead;
    // @tenant-doc:leads siteLeadSchema requires tenantId before write.
    await this.db.collection("leads").doc(parsed.id).set(asDocumentData(parsed));
    return parsed;
  }

  async listLeads(tenantId: string, slug?: string): Promise<SiteLead[]> {
    let query = this.db.collection("leads").where("tenantId", "==", tenantId);
    if (slug) {
      query = query.where("slug", "==", slug);
    }
    const snapshot = await query.get();
    return snapshot.docs
      .map((doc) => siteLeadSchema.parse(doc.data()) as SiteLead)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }
}
