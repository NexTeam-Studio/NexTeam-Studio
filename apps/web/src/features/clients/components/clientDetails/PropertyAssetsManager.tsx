import React, { useEffect, useState } from "react";
import type { CrmProperty } from "../../../nexopsShell/contracts/workspaceContracts";

type AssetField = { key: string; label: string; type: "text" | "number" | "boolean"; required?: boolean };
type AssetDefinition = { kind: string; label: string; fields: AssetField[] };
type PropertyAsset = NonNullable<CrmProperty["assets"]>[number];

export function PropertyAssetsManager({ property, tenantId }: { property: CrmProperty; tenantId: string }): React.ReactElement {
  const [definitions, setDefinitions] = useState<AssetDefinition[]>([]);
  const [assets, setAssets] = useState<PropertyAsset[]>(property.assets ?? []);
  const [selectedKind, setSelectedKind] = useState("");
  const [label, setLabel] = useState("");
  const [fields, setFields] = useState<Record<string, string | number | boolean>>({});
  const [status, setStatus] = useState("");
  const selectedDefinition = definitions.find((definition) => definition.kind === selectedKind);

  useEffect(() => {
    setAssets(property.assets ?? []);
  }, [property.id, property.assets]);

  useEffect(() => {
    void fetch(`/api/crm/settings?tenantId=${encodeURIComponent(tenantId)}`)
      .then((response) => response.json() as Promise<{ ok: boolean; settings?: { propertyAssetDefinitions?: AssetDefinition[] } }>)
      .then((body) => {
        const next = body.ok ? body.settings?.propertyAssetDefinitions ?? [] : [];
        setDefinitions(next);
        setSelectedKind((current) => next.some((definition) => definition.kind === current) ? current : next[0]?.kind ?? "");
      })
      .catch(() => setStatus("Asset types are unavailable right now."));
  }, [tenantId]);

  useEffect(() => {
    if (!selectedDefinition) return;
    setFields(Object.fromEntries(selectedDefinition.fields.map((field) => [field.key, field.type === "boolean" ? false : ""])));
  }, [selectedDefinition?.kind]);

  async function save(nextAssets: PropertyAsset[]): Promise<void> {
    setStatus("Saving assets...");
    try {
      const body = await fetch(`/api/crm/properties/${encodeURIComponent(property.id)}/assets`, {
        method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ tenantId, assets: nextAssets })
      }).then((response) => response.json() as Promise<{ ok: boolean; property?: CrmProperty; error?: string }>);
      if (!body.ok || !body.property) {
        setStatus(body.error ?? "Assets could not be saved.");
        return;
      }
      setAssets(body.property.assets ?? []);
      setStatus("Assets saved.");
    } catch {
      setStatus("Assets could not be saved.");
    }
  }

  function addAsset(): void {
    if (!selectedDefinition || !label.trim()) {
      setStatus("Choose an asset type and enter a label.");
      return;
    }
    void save([...assets, { id: `asset_draft_${Date.now()}`, kind: selectedDefinition.kind, label: label.trim(), fields }]);
    setLabel("");
  }

  return <div className="nexops-mobile-custom-field-readonly" aria-label="Property assets">
    <small>Assets</small>
    {assets.map((asset) => <div key={asset.id}><strong>{asset.label}</strong><small>{asset.kind}{Object.keys(asset.fields).length ? ` · ${Object.entries(asset.fields).map(([key, value]) => `${key}: ${String(value)}`).join(", ")}` : ""}</small><button type="button" onClick={() => void save(assets.filter((item) => item.id !== asset.id))}>Remove</button></div>)}
    {!assets.length ? <strong>No assets saved</strong> : null}
    {selectedDefinition ? <div className="nexops-quote-template-editor">
      <label className="nexops-field"><span>Asset Type</span><select value={selectedKind} onChange={(event) => setSelectedKind(event.target.value)}>{definitions.map((definition) => <option key={definition.kind} value={definition.kind}>{definition.label}</option>)}</select></label>
      <label className="nexops-field"><span>Asset Label</span><input value={label} onChange={(event) => setLabel(event.target.value)} placeholder={selectedDefinition.label} /></label>
      {selectedDefinition.fields.map((field) => <label className="nexops-field" key={field.key}><span>{field.label}{field.required ? " (required)" : ""}</span>{field.type === "boolean" ? <input type="checkbox" checked={fields[field.key] === true} onChange={(event) => setFields({ ...fields, [field.key]: event.target.checked })} /> : <input type={field.type === "number" ? "number" : "text"} value={String(fields[field.key] ?? "")} onChange={(event) => setFields({ ...fields, [field.key]: field.type === "number" && event.target.value !== "" ? Number(event.target.value) : event.target.value })} />}</label>)}
      <button type="button" onClick={addAsset}>Add Asset</button>
    </div> : <small>Configure asset types in Settings before adding assets.</small>}
    {status ? <small>{status}</small> : null}
  </div>;
}
