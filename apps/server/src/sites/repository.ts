import type { Firestore, DocumentData } from "firebase-admin/firestore";
import {
  generatedSiteSchema,
  operatorUiThemeSchema,
  siteLeadSchema,
  type GeneratedSite,
  type OperatorUiTheme,
  type SiteLead
} from "./schemas.js";
import { assertMemoryTenantOwner, setTenantOwnedDocument } from "../core/tenantOwnedWrite.js";

export interface SitesRepository {
  saveSite(site: GeneratedSite): Promise<GeneratedSite>;
  getSiteBySlug(tenantId: string, slug: string): Promise<GeneratedSite | null>;
  listSites(tenantId: string): Promise<GeneratedSite[]>;
  saveLead(lead: SiteLead): Promise<SiteLead>;
  listLeads(tenantId: string, slug?: string): Promise<SiteLead[]>;
  saveOperatorUiTheme(theme: OperatorUiTheme): Promise<OperatorUiTheme>;
  getOperatorUiTheme(tenantId: string): Promise<OperatorUiTheme | null>;
}

export class InMemorySitesRepository implements SitesRepository {
  private readonly sites = new Map<string, GeneratedSite>();
  private readonly leads = new Map<string, SiteLead>();
  private readonly operatorUiThemes = new Map<string, OperatorUiTheme>();

  async saveSite(site: GeneratedSite): Promise<GeneratedSite> {
    const parsed = generatedSiteSchema.parse(site) as GeneratedSite;
    assertMemoryTenantOwner(this.sites.get(parsed.id), parsed.tenantId, `Site ${parsed.id}`);
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
    assertMemoryTenantOwner(this.leads.get(parsed.id), parsed.tenantId, `Site lead ${parsed.id}`);
    this.leads.set(parsed.id, parsed);
    return parsed;
  }

  async listLeads(tenantId: string, slug?: string): Promise<SiteLead[]> {
    return Array.from(this.leads.values())
      .filter((lead) => lead.tenantId === tenantId && (!slug || lead.slug === slug))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async saveOperatorUiTheme(theme: OperatorUiTheme): Promise<OperatorUiTheme> {
    const parsed = operatorUiThemeSchema.parse(theme) as OperatorUiTheme;
    assertMemoryTenantOwner(this.operatorUiThemes.get(parsed.tenantId), parsed.tenantId, `Operator UI theme ${parsed.tenantId}`);
    this.operatorUiThemes.set(parsed.tenantId, parsed);
    return parsed;
  }

  async getOperatorUiTheme(tenantId: string): Promise<OperatorUiTheme | null> {
    return this.operatorUiThemes.get(tenantId) ?? null;
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
    await setTenantOwnedDocument({ db: this.db, collection: "sitePages", id: parsed.id, tenantId: parsed.tenantId, data: asDocumentData(parsed), label: `Site ${parsed.id}` });
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
    await setTenantOwnedDocument({ db: this.db, collection: "leads", id: parsed.id, tenantId: parsed.tenantId, data: asDocumentData(parsed), label: `Site lead ${parsed.id}` });
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

  async saveOperatorUiTheme(theme: OperatorUiTheme): Promise<OperatorUiTheme> {
    const parsed = operatorUiThemeSchema.parse(theme) as OperatorUiTheme;
    await setTenantOwnedDocument({ db: this.db, collection: "operatorUiPreferences", id: `${parsed.tenantId}_job_desk`, tenantId: parsed.tenantId, data: asDocumentData(parsed), label: `Operator UI theme ${parsed.tenantId}` });
    return parsed;
  }

  async getOperatorUiTheme(tenantId: string): Promise<OperatorUiTheme | null> {
    const doc = await this.db.collection("operatorUiPreferences").doc(`${tenantId}_job_desk`).get();
    return doc.exists ? (operatorUiThemeSchema.parse(doc.data()) as OperatorUiTheme) : null;
  }
}
