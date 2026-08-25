import React from "react";
import { parseCsvPreview } from "../workspaceSupport";
import { NexOpsNavGlyph } from "../workspaceSupport";
import { ModuleHeroCard } from "../../../shared/ui/NexOpsBusinessTemplates";

export function NexOpsImportPage(props: {
  csvStatus: string;
  setCsvStatus: React.Dispatch<React.SetStateAction<string>>;
}): React.ReactElement {
  const { csvStatus, setCsvStatus } = props;
  return (
    <section className="nexops-module-page">
      <ModuleHeroCard title="Import & Sync" detail="CSV import for every tenant. Third-party adapters stay dormant unless a future tenant explicitly opts in." icon={<NexOpsNavGlyph module="imports" />} />
      <div className="nexops-module-grid">
        <article className="nexops-module-card">
          <p className="eyebrow">CSV import</p>
          <h2>Preview before write</h2>
          <p>{csvStatus}</p>
          <input
            aria-label="CSV import file"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) {
                setCsvStatus("No CSV selected yet.");
                return;
              }
              file.text()
                .then((text) => {
                  const preview = parseCsvPreview(text);
                  setCsvStatus(`${preview.rows} row${preview.rows === 1 ? "" : "s"} detected. Columns: ${preview.columns.join(", ") || "none"}. Commit endpoint remains approval-gated.`);
                })
                .catch(() => setCsvStatus("Could not read that CSV file."));
            }}
          />
        </article>
      </div>
    </section>
  );
}

