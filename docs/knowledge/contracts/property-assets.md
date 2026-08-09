DOCUMENT_ID: NEXTEAM-PROPERTY-ASSETS-CONTRACT-20260808
STATUS: ACTIVE

# Tenant-configurable property assets

`crmSettings/{tenantId}.propertyAssetDefinitions` defines the asset types available to that tenant. Each definition has a unique `kind`, display `label`, and typed fields (`text`, `number`, or `boolean`).

Property records continue to be stored at `properties/{propertyId}` and retain their existing `clientId` relationship. Their `assets` array contains `{ id, kind, label, fields }`; no parallel client or property store is introduced.

## Command

`PUT /api/crm/properties/:propertyId/assets`

Body: `{ tenantId?, assets }`. The command requires `OWNER` or `OFFICE_ADMIN` access for the requested tenant, verifies that the property and its client belong to that tenant, validates every asset against that tenant's configured definition, then replaces and persists the property's asset list.

## Events

The command returns `{ ok: true, property }` after persistence. Invalid types, unknown fields, missing required fields, duplicate asset IDs, unconfigured asset types, cross-tenant access, and missing properties are rejected without a write.
