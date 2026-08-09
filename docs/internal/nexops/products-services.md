Last updated: 2026-07-15
Build piece: Mobile UI / intake expansion / catalog / templates combined pass

## Object

`ProductServiceCatalogItem`

- Tenant-scoped shared line-item catalog used by Quotes, Invoices, and Settings.
- Stored on `CrmSettings.catalogItems`.
- Current field set:
  - `id`
  - `tenantId`
  - `code`
  - `name`
  - `description?`
- `price`
- `category = "service" | "material" | "equipment"`
  - `tag`
  - `taxable`
  - `visible`
  - `source = "seed" | "tenant"`
  - `createdAt`
  - `updatedAt`

## Triggers

### Settings management
- `GET /api/crm/settings`
- `PATCH /api/crm/settings`
- The Settings page is now the tenant management surface for Products & Services.
- Staff can:
  - search existing items
  - open an editor modal
  - create new tenant items
  - update existing tenant items

### Quote / Invoice picker
- Shared picker component is used on:
  - quote composer
  - invoice editor
- Flow:
  - click `Add line item`
  - type to search matching catalog items
  - select an existing item to prefill line details
  - or confirm a new typed item and save it back into the catalog through the same modal

## Cascades

### Shared line-item behavior
- Catalog selection prefills:
  - immutable `catalogItemId`
  - code
  - name
  - description
  - price
- `catalogItemId` is the stable reference. `catalogCode` remains a display/legacy snapshot and is not used as the primary lookup key.
- Line-level edits after selection do not mutate the catalog record automatically.
- Quotes and invoices snapshot the line values they used at compose time.

### Seed vs tenant items
- Seed items come from the native tenant defaults and are materialized into that tenant's Settings record.
- Tenant-created items are stored with `source = "tenant"`.
- Code matching is case-insensitive when tools or UI save an item back to Settings.
- Settings rejects catalog entries with another tenant id or duplicate item ids/codes; quote, job, and invoice catalog references are checked against the active tenant catalog.

## Nexi tools

- `listCatalogItems`
- `saveCatalogItem`

Current behavior:
- Nexi can read the shared catalog before composing a quote or invoice.
- Nexi can create or update tenant catalog items through the same `CrmSettings` store the UI uses.

## Current deliberate limits

- No category hierarchy beyond the freeform `tag` field is modeled yet.
- No catalog archive/delete flow is built yet; items are managed through `visible`.
- No live transcript receipt for invoice-side catalog creation has been captured yet in this pass; the same shared picker is wired, but conversational proof still needs to be recorded when this combined piece is formally receipted.
