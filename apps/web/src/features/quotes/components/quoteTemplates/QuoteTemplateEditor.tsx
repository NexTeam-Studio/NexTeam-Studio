import React from "react";

export interface QuoteTemplateDraft {
  id: string;
  name: string;
  description: string;
  titlePrefix: string;
  expiryDays: string;
  terms: string;
  requireSignature: boolean;
  requireDeposit: boolean;
  requireCardOnFile: boolean;
  depositKind: "amount" | "percent";
  depositValue: number;
}

export interface QuoteTemplateSummary {
  id: string;
  name: string;
  defaultLineItems?: unknown[];
}

interface QuoteTemplateEditorProps<Template extends QuoteTemplateSummary> {
  templates: Template[];
  draft: QuoteTemplateDraft;
  captureComposerLines: boolean;
  busy: boolean;
  onSelect: (template: Template) => void;
  onClear: () => void;
  onDraftChange: (draft: QuoteTemplateDraft) => void;
  onCaptureComposerLinesChange: (value: boolean) => void;
  onSave: () => void;
}

export function QuoteTemplateEditor<Template extends QuoteTemplateSummary>(props: QuoteTemplateEditorProps<Template>): React.ReactElement {
  const patchDraft = (patch: Partial<QuoteTemplateDraft>) => props.onDraftChange({ ...props.draft, ...patch });

  return (
    <>
      <div className="nexops-quote-template-list">
        {props.templates.map((template) => (
          <button className="nexops-quote-template-chip" key={template.id} type="button" onClick={() => props.onSelect(template)}>
            <strong>{template.name}</strong>
            <small>{template.defaultLineItems?.length ?? 0} Default Lines</small>
          </button>
        ))}
      </div>

      <div className="nexops-quote-template-editor">
        <div className="nexops-quote-section-head">
          <h3>{props.draft.id ? "Edit Template" : "New Template"}</h3>
          {props.draft.id ? <button type="button" onClick={props.onClear}>Clear</button> : null}
        </div>
        <div className="nexops-request-builder-grid">
          <label className="nexops-field"><span>Name</span><input value={props.draft.name} onChange={(event) => patchDraft({ name: event.target.value })} /></label>
          <label className="nexops-field"><span>Title Prefix</span><input value={props.draft.titlePrefix} onChange={(event) => patchDraft({ titlePrefix: event.target.value })} /></label>
        </div>
        <label className="nexops-field"><span>Description</span><input value={props.draft.description} onChange={(event) => patchDraft({ description: event.target.value })} /></label>
        <div className="nexops-request-builder-grid">
          <label className="nexops-field"><span>Expiry Days Override</span><input value={props.draft.expiryDays} onChange={(event) => patchDraft({ expiryDays: event.target.value })} /></label>
          <label className="nexops-check-field inline">
            <input type="checkbox" checked={props.captureComposerLines} onChange={(event) => props.onCaptureComposerLinesChange(event.target.checked)} />
            Save Current Composer Lines into This Template
          </label>
        </div>
        <div className="nexops-quote-toggle-grid">
          <label className="nexops-check-field inline"><input type="checkbox" checked={props.draft.requireSignature} onChange={(event) => patchDraft({ requireSignature: event.target.checked })} />Signature</label>
          <label className="nexops-check-field inline"><input type="checkbox" checked={props.draft.requireDeposit} onChange={(event) => patchDraft({ requireDeposit: event.target.checked })} />Deposit</label>
          <label className="nexops-check-field inline"><input type="checkbox" checked={props.draft.requireCardOnFile} onChange={(event) => patchDraft({ requireCardOnFile: event.target.checked })} />Card on File</label>
        </div>
        {(props.draft.requireDeposit || props.draft.requireCardOnFile) ? (
          <div className="nexops-request-builder-grid">
            <label className="nexops-field">
              <span>Deposit Type</span>
              <select value={props.draft.depositKind} onChange={(event) => patchDraft({ depositKind: event.target.value as QuoteTemplateDraft["depositKind"] })}>
                <option value="amount">Flat amount</option><option value="percent">Percent</option>
              </select>
            </label>
            <label className="nexops-field"><span>Deposit Value</span><input type="number" min="0" step="0.01" value={props.draft.depositValue} onChange={(event) => patchDraft({ depositValue: Math.max(0, Number(event.target.value || 0)) })} /></label>
          </div>
        ) : null}
        <label className="nexops-field"><span>Template Terms Override</span><textarea rows={4} value={props.draft.terms} onChange={(event) => patchDraft({ terms: event.target.value })} /></label>
        <div className="nexops-inline-actions">
          <button type="button" onClick={props.onSave} disabled={props.busy}>{props.busy ? "Saving..." : props.draft.id ? "Save Template" : "Create Template"}</button>
        </div>
      </div>
    </>
  );
}
