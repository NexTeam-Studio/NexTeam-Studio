import type { Request, Response } from "express";
import type { Client, Property } from "@nexteam/core";
import type { CrmRouteContext } from "../../../../../runtime/routeRuntime.js";
import { createClientBodySchema, hasClientCreateAddress, hasClientCreatePhone, propertyAssetsBodySchema, updateClientBodySchema } from "./routeSchemas.js";
import { quickPaymentRequestBodySchema } from "../../../../invoices/components/paymentRails/server/routeSchemas.js";
import { sendPortalLinkBodySchema } from "../../../../../../nexportal/components/portalCore/server/routeSchemas.js";
import {
  isProtectedLegacyClient,
  legacyClientDeleteMessage,
  preserveLegacyClientClassification
} from "./clientDeletionPolicy.js";

export function registerContactRoutes(context: CrmRouteContext): void {
  const {
    RailError,
    actorIdForAccess,
    app,
    createQuickPaymentRequestRecord,
    defaultTenantId,
    deps,
    env,
    fetchAddressSuggestions,
    portalHub,
    providerForTenant,
    publicOrigin,
    randomUUID,
    repositoryForTenant,
    requireBillingAccess,
    requireQuoteAccess,
    requireTenantRole,
    sendRouteError,
  } = context;

  app.get("/api/crm/clients", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim()
        ? req.query.tenantId
        : defaultTenantId(env);
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN", "TECHNICIAN"], { requestedTenantId: tenantId, op: "listClients" });
      const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
      const cursor = typeof req.query.cursor === "string" && req.query.cursor.trim() ? req.query.cursor : undefined;
      const repository = repositoryForTenant();
      if (q && repository.searchClients) {
        res.json({ ok: true, clients: await repository.searchClients(tenantId, q) });
        return;
      }
      if (!q && repository.listClientsPage) {
        const page = await repository.listClientsPage(tenantId, { cursor });
        res.json({ ok: true, clients: page.records, nextCursor: page.nextCursor });
        return;
      }
      const clients = await providerForTenant(tenantId).getClients(q);
      res.json({ ok: true, clients });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/crm/clients/:id", async (req: Request, res: Response) => {
    try {
      const clientId = req.params.id;
      if (!clientId) throw new RailError("Client id is required.", { provider: "native", op: "getClient", status: 400 });
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim()
        ? req.query.tenantId
        : defaultTenantId(env);
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN", "TECHNICIAN"], { requestedTenantId: tenantId, op: "getClient" });
      const repository = repositoryForTenant();
      const client = repository.getClient
        ? await repository.getClient(tenantId, clientId)
        : (await repository.listClients(tenantId)).find((record) => record.id === clientId) ?? null;
      if (!client) throw new RailError(`Client ${clientId} was not found.`, { provider: "native", op: "getClient", status: 404 });
      res.json({ ok: true, client });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/crm/properties", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim()
        ? req.query.tenantId
        : defaultTenantId(env);
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN", "TECHNICIAN"], { requestedTenantId: tenantId, op: "listProperties" });
      const properties = await repositoryForTenant().listProperties(tenantId);
      res.json({ ok: true, properties });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.put("/api/crm/properties/:id/assets", async (req: Request, res: Response) => {
    try {
      const propertyId = req.params.id;
      if (!propertyId) {
        throw new RailError("Property id is required.", { provider: "native", op: "updatePropertyAssets", status: 400 });
      }
      const input = propertyAssetsBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], { requestedTenantId: tenantId, op: "updatePropertyAssets" });
      const repository = repositoryForTenant();
      const [properties, clients, settings] = await Promise.all([
        repository.listProperties(tenantId),
        repository.listClients(tenantId),
        repository.getCrmSettings(tenantId)
      ]);
      const property = properties.find((record) => record.id === propertyId);
      if (!property || !clients.some((client) => client.id === property.clientId)) {
        throw new RailError(`Property ${propertyId} was not found.`, { provider: "native", op: "updatePropertyAssets", status: 404 });
      }
      const definitions = new Map(settings.propertyAssetDefinitions.map((definition) => [definition.kind.trim().toLowerCase(), definition]));
      const assets = input.assets.map((asset) => {
        const definition = definitions.get(asset.kind.trim().toLowerCase());
        if (!definition) {
          throw new RailError(`Property asset type ${asset.kind} is not configured for this tenant.`, { provider: "native", op: "updatePropertyAssets", status: 400 });
        }
        const fields = new Map(definition.fields.map((field) => [field.key, field]));
        for (const [key, value] of Object.entries(asset.fields)) {
          const field = fields.get(key);
          if (!field) {
            throw new RailError(`Property asset field ${key} is not configured for ${definition.label}.`, { provider: "native", op: "updatePropertyAssets", status: 400 });
          }
          const expectedType = field.type === "text" ? "string" : field.type;
          if (typeof value !== expectedType) {
            throw new RailError(`Property asset field ${field.label} must be a ${field.type}.`, { provider: "native", op: "updatePropertyAssets", status: 400 });
          }
        }
        for (const field of definition.fields) {
          if (field.required && (asset.fields[field.key] === undefined || asset.fields[field.key] === "")) {
            throw new RailError(`Property asset field ${field.label} is required.`, { provider: "native", op: "updatePropertyAssets", status: 400 });
          }
        }
        return {
          id: asset.id ?? `asset_${randomUUID()}`,
          kind: definition.kind,
          label: asset.label.trim(),
          fields: asset.fields
        };
      });
      if (new Set(assets.map((asset) => asset.id)).size !== assets.length) {
        throw new RailError("Property asset ids must be unique.", { provider: "native", op: "updatePropertyAssets", status: 400 });
      }
      const saved = await repository.upsertProperty({ ...property, assets });
      res.json({ ok: true, property: saved });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/crm/address-suggestions", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim()
        ? req.query.tenantId
        : defaultTenantId(env);
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN", "TECHNICIAN"], { requestedTenantId: tenantId, op: "addressSuggestions" });
      const query = typeof req.query.query === "string" ? req.query.query.trim() : "";
      if (query.length < 3) {
        res.json({ ok: true, suggestions: [] });
        return;
      }
      const apiKey = env.GOOGLE_MAPS_API_KEY?.trim();
      if (!apiKey) {
        res.json({ ok: true, suggestions: [] });
        return;
      }
      const suggestions = await fetchAddressSuggestions(query, apiKey);
      res.json({ ok: true, suggestions });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/clients", async (req: Request, res: Response) => {
    try {
      const input = createClientBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], { requestedTenantId: tenantId, op: "createClient" });
      const provider = providerForTenant(tenantId);
      const client = await provider.createClient({
        tenantId,
        name: input.name,
        company: input.company,
        personName: input.personName,
        displayNamePreference: input.displayNamePreference,
        billingAddress: input.billingAddress,
        billingSameAsPrimaryProperty: input.billingSameAsPrimaryProperty,
        contacts: input.contacts,
        communicationSettings: input.communicationSettings,
        emails: input.emails,
        phones: input.phones,
        consent: input.consent,
        customFields: input.customFields
      });
      let property: Property | undefined;
      if (input.primaryProperty) {
        const propertyInput = input.primaryProperty;
        property = await repositoryForTenant().upsertProperty({
          id: `property_${randomUUID()}`,
          tenantId,
          clientId: client.id,
          siteName: propertyInput.siteName,
          label: propertyInput.label,
          address: propertyInput.address,
          geo: propertyInput.geo,
          billingAddressSameAsClient: propertyInput.billingAddressSameAsClient,
          access: propertyInput.access,
          contacts: propertyInput.contacts,
          assets: [],
          customFields: propertyInput.customFields
        });
      }
      res.status(201).json({ ok: true, client, property });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.patch("/api/crm/clients/:id", async (req: Request, res: Response) => {
    try {
      const clientId = req.params.id;
      if (!clientId) {
        throw new RailError("Client id is required.", { provider: "native", op: "updateClient", status: 400 });
      }
      const input = updateClientBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId: tenantId,
        op: "updateClient"
      });
      const repository = repositoryForTenant();
      const [clients, properties] = await Promise.all([
        repository.listClients(tenantId),
        repository.listProperties(tenantId)
      ]);
      const existing = clients.find((record) => record.id === clientId);
      if (!existing) {
        throw new RailError(`Client ${clientId} was not found.`, { provider: "native", op: "updateClient", status: 404 });
      }
      const existingProperty = properties.find((record) => record.clientId === clientId);
      const nextName = input.name ?? existing.name;
      const nextPersonName = input.personName ?? existing.personName;
      const nextContacts = input.contacts ?? existing.contacts ?? [];
      const nextPhones = input.phones ?? existing.phones;
      const nextBillingAddress = input.billingAddress === null ? undefined : (input.billingAddress ?? existing.billingAddress);
      const nextPropertyAddress = input.primaryProperty?.address ?? existingProperty?.address;
      if (!nextName.trim()) {
        throw new RailError("Name is required before a client can be saved.", { provider: "native", op: "updateClient", status: 400 });
      }
      if (!hasClientCreatePhone({ phones: nextPhones, contacts: nextContacts })) {
        throw new RailError("Telephone is required before a client can be saved.", { provider: "native", op: "updateClient", status: 400 });
      }
      const updatesAddress = input.billingAddress !== undefined || input.primaryProperty !== undefined;
      if (updatesAddress && !hasClientCreateAddress({ billingAddress: nextBillingAddress, primaryProperty: nextPropertyAddress ? { address: nextPropertyAddress } : undefined })) {
        throw new RailError("Address is required before a client can be saved.", { provider: "native", op: "updateClient", status: 400 });
      }
      const nextClient: Client = {
        ...existing,
        name: nextName,
        ...(nextPersonName ? { personName: nextPersonName } : {}),
        ...(input.displayNamePreference ? { displayNamePreference: input.displayNamePreference } : {}),
        ...(input.billingSameAsPrimaryProperty !== undefined ? { billingSameAsPrimaryProperty: input.billingSameAsPrimaryProperty } : {}),
        ...(input.contacts ? { contacts: input.contacts } : {}),
        ...(input.communicationSettings ? { communicationSettings: input.communicationSettings } : {}),
        ...(input.emails ? { emails: input.emails } : {}),
        ...(input.phones ? { phones: input.phones } : {}),
        customFields: preserveLegacyClientClassification(existing, input.customFields ?? existing.customFields),
        consent: input.consent ? {
          email: input.consent.email ?? existing.consent.email,
          sms: input.consent.sms ?? existing.consent.sms,
          marketing: input.consent.marketing ?? existing.consent.marketing ?? false
        } : existing.consent
      };
      if (input.company !== undefined) {
        if (input.company === null) {
          delete nextClient.company;
        } else {
          nextClient.company = input.company;
        }
      }
      if (input.billingAddress !== undefined) {
        if (input.billingAddress === null) {
          delete nextClient.billingAddress;
        } else {
          nextClient.billingAddress = input.billingAddress;
        }
      }
      const updated = await repository.upsertClient(nextClient);
      let property: Property | undefined;
      if (input.primaryProperty) {
        property = await repository.upsertProperty({
          ...(existingProperty ?? {
            id: `property_${randomUUID()}`,
            tenantId,
            clientId,
            assets: []
          }),
          tenantId,
          clientId,
          siteName: input.primaryProperty.siteName ?? existingProperty?.siteName,
          label: input.primaryProperty.label ?? existingProperty?.label ?? input.primaryProperty.address.street1,
          address: input.primaryProperty.address,
          geo: input.primaryProperty.geo ?? existingProperty?.geo,
          billingAddressSameAsClient: input.primaryProperty.billingAddressSameAsClient ?? existingProperty?.billingAddressSameAsClient,
          access: input.primaryProperty.access ?? existingProperty?.access,
          contacts: input.primaryProperty.contacts ?? existingProperty?.contacts,
          assets: existingProperty?.assets ?? [],
          customFields: input.primaryProperty.customFields ?? existingProperty?.customFields
        });
      }
      if (input.consent?.marketing !== undefined) {
        await deps.nexReachService?.handleConsentChange({
          tenantId,
          clientId: updated.id,
          marketingConsent: updated.consent.marketing ?? false
        });
      }
      res.json({ ok: true, client: updated, ...(property ? { property } : {}) });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.delete("/api/crm/clients/:id", async (req: Request, res: Response) => {
    try {
      const clientId = req.params.id;
      if (!clientId) {
        throw new RailError("Client id is required.", { provider: "native", op: "deleteClient", status: 400 });
      }
      const tenantId = String(req.query.tenantId ?? req.body?.tenantId ?? defaultTenantId(env));
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId: tenantId,
        op: "deleteClient"
      });
      const repository = repositoryForTenant();
      const existing = (await repository.listClients(tenantId)).find((record) => record.id === clientId);
      if (!existing) {
        throw new RailError(`Client ${clientId} was not found.`, { provider: "native", op: "deleteClient", status: 404 });
      }
      if (isProtectedLegacyClient(existing)) {
        throw new RailError(legacyClientDeleteMessage(), {
          provider: "native",
          op: "deleteClient",
          status: 409
        });
      }
      const [requests, quotes, jobs, invoices, properties] = await Promise.all([
        repository.listRequests(tenantId),
        repository.listQuotes(tenantId),
        repository.listJobs(tenantId),
        repository.listInvoices(tenantId),
        repository.listProperties(tenantId)
      ]);
      const linkedRequestCount = requests.filter((request) =>
        request.selectedClientId === clientId || request.match?.matchedClientId === clientId
      ).length;
      const linkedQuoteCount = quotes.filter((quote) => quote.clientId === clientId).length;
      const linkedJobCount = jobs.filter((job) => job.clientId === clientId).length;
      const linkedInvoiceCount = invoices.filter((invoice) => invoice.clientId === clientId).length;
      if (linkedRequestCount || linkedQuoteCount || linkedJobCount || linkedInvoiceCount) {
        throw new RailError("Delete is blocked because this client already has linked work or billing history.", {
          provider: "native",
          op: "deleteClient",
          status: 409
        });
      }
      const propertyIds = properties
        .filter((property) => property.clientId === clientId)
        .map((property) => property.id);
      const deletedPropertyIds = await repository.deletePropertiesForClient(tenantId, clientId);
      await repository.deleteClient(tenantId, clientId);
      res.json({
        ok: true,
        clientId,
        deletedPropertyIds,
        blockedLinks: {
          requests: linkedRequestCount,
          quotes: linkedQuoteCount,
          jobs: linkedJobCount,
          invoices: linkedInvoiceCount
        },
        propertyIds
      });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/clients/:id/quick-payment-request", async (req: Request, res: Response) => {
    try {
      const clientId = req.params.id;
      if (!clientId) {
        throw new RailError("Client id is required.", { provider: "native", op: "createQuickPaymentRequest", status: 400 });
      }
      const input = quickPaymentRequestBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireBillingAccess(req, tenantId, "createQuickPaymentRequest");
      const client = (await repositoryForTenant().listClients(tenantId)).find((record) => record.id === clientId);
      if (!client) {
        throw new RailError(`Client ${clientId} was not found.`, { provider: "native", op: "createQuickPaymentRequest", status: 404 });
      }
      const result = await createQuickPaymentRequestRecord({
        tenantId,
        clientId: client.id,
        title: input.title.trim(),
        amount: input.amount,
        ...(input.memo?.trim() ? { memo: input.memo.trim() } : {}),
        actorId: actorIdForAccess(access),
        delivery: input.delivery,
        publicBaseUrl: publicOrigin(req)
      });
      res.status(201).json({ ok: true, tenantId, actorRole: access.role, ...result });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/clients/:id/portal-link", async (req: Request, res: Response) => {
    try {
      const clientId = req.params.id;
      if (!clientId) {
        throw new RailError("Client id is required.", { provider: "native", op: "sendPortalLink", status: 400 });
      }
      const input = sendPortalLinkBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireQuoteAccess(req, tenantId, "sendPortalLink");
      const result = await portalHub().issueMagicLink({
        tenantId,
        clientId,
        ...(input.propertyId ? { propertyId: input.propertyId } : {}),
        ...(input.target?.trim() ? { target: input.target.trim() } : {}),
        ...(input.preferredChannel ? { preferredChannel: input.preferredChannel } : {}),
        ...(input.sourceObjectType ? { sourceObjectType: input.sourceObjectType } : {}),
        ...(input.sourceObjectId ? { sourceObjectId: input.sourceObjectId } : {})
      });
      res.status(201).json({
        ok: true,
        tenantId,
        actorRole: access.role,
        clientId,
        portalLink: result.url,
        session: result.session,
        delivery: result.delivery,
        target: result.target
      });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/crm/clients/:id/portal-activity", async (req: Request, res: Response) => {
    try {
      const clientId = req.params.id;
      if (!clientId) {
        throw new RailError("Client id is required.", { provider: "native", op: "getClientPortalActivity", status: 400 });
      }
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim()
        ? req.query.tenantId
        : defaultTenantId(env);
      const access = await requireQuoteAccess(req, tenantId, "getClientPortalActivity");
      const activity = await portalHub().getPortalActivity({ tenantId, clientId });
      res.json({ ok: true, tenantId, actorRole: access.role, clientId, activity });
    } catch (error) {
      sendRouteError(res, error);
    }
  });
}
