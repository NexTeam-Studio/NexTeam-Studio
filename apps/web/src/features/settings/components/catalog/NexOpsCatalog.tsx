import React, { useEffect, useMemo, useRef } from "react";

export interface ProductServiceCatalogItem {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  description?: string;
  price: number;
  category: "service" | "material" | "equipment";
  tag: string;
  taxable: boolean;
  visible: boolean;
  source: "seed" | "tenant";
  createdAt: string;
  updatedAt: string;
}

export interface CatalogItemDraft {
  id: string;
  code: string;
  name: string;
  description: string;
  price: number;
  category: "service" | "material" | "equipment";
  tag: string;
  taxable: boolean;
  visible: boolean;
  source: "seed" | "tenant";
}

interface CatalogPickerProps {
  open: boolean;
  search: string;
  catalogItems: ProductServiceCatalogItem[];
  title?: string;
  onSearchChange: (value: string) => void;
  onClose: () => void;
  onSelect: (item: ProductServiceCatalogItem) => void;
  onCreateRequested: (seed: string) => void;
}

interface CatalogEditorModalProps {
  open: boolean;
  title: string;
  saveLabel?: string;
  busy?: boolean;
  draft: CatalogItemDraft;
  onDraftChange: (draft: CatalogItemDraft) => void;
  onClose: () => void;
  onSave: () => void;
}

function now(): string {
  return new Date().toISOString();
}

function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}

export function catalogCodeSeed(value: string): string {
  const letters = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return letters || "NEW-ITEM";
}

export function blankCatalogItemDraft(seed = ""): CatalogItemDraft {
  return {
    id: "",
    code: catalogCodeSeed(seed),
    name: seed.trim(),
    description: "",
    price: 0,
    category: "service",
    tag: "Service",
    taxable: true,
    visible: true,
    source: "tenant"
  };
}

export function catalogDraftFromItem(item: ProductServiceCatalogItem): CatalogItemDraft {
  return {
    id: item.id,
    code: item.code,
    name: item.name,
    description: item.description ?? "",
    price: item.price,
    category: item.category ?? "service",
    tag: item.tag,
    taxable: item.taxable,
    visible: item.visible,
    source: item.source
  };
}

export function catalogItemFromDraft(
  tenantId: string,
  draft: CatalogItemDraft,
  existing?: ProductServiceCatalogItem
): ProductServiceCatalogItem {
  const timestamp = now();
  return {
    id: existing?.id ?? (draft.id.trim() || `catalog_${catalogCodeSeed(draft.code || draft.name).toLowerCase().replace(/[^a-z0-9]+/g, "_")}`),
    tenantId,
    code: draft.code.trim() || catalogCodeSeed(draft.name),
    name: draft.name.trim(),
    ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
    price: roundMoney(Math.max(0, draft.price)),
    category: draft.category,
    tag: draft.tag.trim() || "Service",
    taxable: draft.taxable,
    visible: draft.visible,
    source: "tenant",
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp
  };
}

export function NexOpsCatalogPicker(props: CatalogPickerProps): React.ReactElement | null {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const normalizedSearch = props.search.trim().toLowerCase();
  const filteredItems = useMemo(
    () => [...props.catalogItems]
      .filter((item) => item.visible)
      .filter((item) => {
        if (!normalizedSearch) {
          return true;
        }
        return [
          item.id,
          item.code,
          item.name,
          item.category,
          item.description,
          item.tag
        ].join(" ").toLowerCase().includes(normalizedSearch);
      })
      .sort((left, right) => left.name.localeCompare(right.name)),
    [normalizedSearch, props.catalogItems]
  );
  const hasExactMatch = filteredItems.some((item) => {
    const value = props.search.trim().toLowerCase();
    return item.name.trim().toLowerCase() === value || item.code.trim().toLowerCase() === value;
  });

  useEffect(() => {
    if (!props.open) {
      return;
    }
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [props.open]);

  if (!props.open) {
    return null;
  }

  return (
    <div className="nexops-modal-layer" role="presentation">
      <button className="nexops-modal-backdrop" type="button" aria-label="Close line item picker" onClick={props.onClose} />
      <section className="nexops-modal-card" role="dialog" aria-modal="true" aria-label={props.title ?? "Add line item"}>
        <div className="nexops-modal-head">
          <div>
            <p className="eyebrow">Products &amp; services</p>
            <h2>{props.title ?? "Add line item"}</h2>
          </div>
          <button type="button" onClick={props.onClose}>Close</button>
        </div>
        <label className="nexops-field">
          <span>Search catalog</span>
          <input
            ref={inputRef}
            value={props.search}
            onChange={(event) => props.onSearchChange(event.target.value)}
            placeholder="Type a service name or code"
          />
        </label>
        <div className="nexops-catalog-picker-list">
          {filteredItems.map((item) => (
            <button className="nexops-catalog-picker-item" type="button" key={item.id} onClick={() => props.onSelect(item)}>
              <span>
                <strong>{item.name}</strong>
                <small>{item.code} · {item.category} · {item.tag}</small>
                <small>{item.description ?? "No saved description yet."}</small>
              </span>
              <mark>${item.price.toFixed(2)}</mark>
            </button>
          ))}
          {!filteredItems.length ? (
            <div className="nexops-catalog-picker-empty">
              <strong>No catalog matches yet</strong>
              <small>Save this as a new product or service and it will be reusable everywhere.</small>
            </div>
          ) : null}
        </div>
        {!hasExactMatch && props.search.trim() ? (
          <button className="nexops-catalog-create-button" type="button" onClick={() => props.onCreateRequested(props.search.trim())}>
            Add "{props.search.trim()}" as a new catalog item
          </button>
        ) : null}
      </section>
    </div>
  );
}

export function NexOpsCatalogEditorModal(props: CatalogEditorModalProps): React.ReactElement | null {
  if (!props.open) {
    return null;
  }
  return (
    <div className="nexops-modal-layer" role="presentation">
      <button className="nexops-modal-backdrop" type="button" aria-label="Close catalog editor" onClick={props.onClose} />
      <section className="nexops-modal-card" role="dialog" aria-modal="true" aria-label={props.title}>
        <div className="nexops-modal-head">
          <div>
            <p className="eyebrow">Catalog editor</p>
            <h2>{props.title}</h2>
          </div>
          <button type="button" onClick={props.onClose}>Close</button>
        </div>
        <div className="nexops-request-builder-grid">
          <label className="nexops-field">
            <span>Name</span>
            <input
              value={props.draft.name}
              onChange={(event) => props.onDraftChange({
                ...props.draft,
                name: event.target.value,
                code: props.draft.id ? props.draft.code : catalogCodeSeed(event.target.value)
              })}
            />
          </label>
          <label className="nexops-field">
            <span>Code</span>
            <input value={props.draft.code} onChange={(event) => props.onDraftChange({ ...props.draft, code: event.target.value.toUpperCase() })} />
          </label>
        </div>
        <label className="nexops-field">
          <span>Description</span>
          <textarea rows={4} value={props.draft.description} onChange={(event) => props.onDraftChange({ ...props.draft, description: event.target.value })} />
        </label>
        <div className="nexops-request-builder-grid">
          <label className="nexops-field">
            <span>Price</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={props.draft.price}
              onChange={(event) => props.onDraftChange({ ...props.draft, price: Math.max(0, Number(event.target.value || 0)) })}
            />
          </label>
          <label className="nexops-field">
            <span>Category</span>
            <select value={props.draft.category} onChange={(event) => props.onDraftChange({ ...props.draft, category: event.target.value as CatalogItemDraft["category"] })}>
              <option value="service">Service</option>
              <option value="material">Material</option>
              <option value="equipment">Equipment</option>
            </select>
          </label>
          <label className="nexops-field">
            <span>Tag</span>
            <input value={props.draft.tag} onChange={(event) => props.onDraftChange({ ...props.draft, tag: event.target.value })} placeholder="Service" />
          </label>
        </div>
        <div className="nexops-quote-toggle-grid">
          <label className="nexops-check-field inline">
            <input type="checkbox" checked={props.draft.taxable} onChange={(event) => props.onDraftChange({ ...props.draft, taxable: event.target.checked })} />
            Taxable
          </label>
          <label className="nexops-check-field inline">
            <input type="checkbox" checked={props.draft.visible} onChange={(event) => props.onDraftChange({ ...props.draft, visible: event.target.checked })} />
            Visible in pickers
          </label>
        </div>
        <div className="nexops-inline-actions">
          <button type="button" onClick={props.onSave} disabled={props.busy || !props.draft.name.trim()}>
            {props.busy ? "Saving..." : (props.saveLabel ?? "Save item")}
          </button>
        </div>
      </section>
    </div>
  );
}
