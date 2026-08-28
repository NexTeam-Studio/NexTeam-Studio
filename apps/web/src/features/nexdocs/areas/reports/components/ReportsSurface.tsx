import React from "react";
import { clientDisplayName } from "../../../../nexopsShell/workspaceSupport";
import type { NexCamWorkspaceBindings } from "../../../../nexcam/areas/capture/hooks/useNexCamWorkspace";

export function ReportsSurface(props: { workspace: NexCamWorkspaceBindings }): React.ReactElement {
  const {
    clientFilterId,
    clients,
    createReport,
    dateFrom,
    dateTo,
    operatorContext,
    refreshReports,
    report,
    reportKind,
    reportTemplates,
    reportTitle,
    reportUrl,
    reports,
    selectedReportTemplateId,
    selectedSnippetIds,
    setClientFilterId,
    setDateFrom,
    setDateTo,
    setReportKind,
    setReportTitle,
    setSelectedReportTemplateId,
    setWatermarkEnabled,
    textSnippets,
    toggleSnippetSelection,
    watermarkEnabled
  } = props.workspace;

    return (
      <section className="nexops-module-page">
        <div className="nexops-page-heading">
          <div>
            <h1>Reports</h1>
            <p>Checklist to branded PDF, ready for closeout receipt attachments.</p>
          </div>
          <div className="nexops-inline-actions">
            <button className="nexops-link-button" type="button" onClick={() => void refreshReports()}>Refresh reports</button>
            <button type="button" onClick={() => void createReport()}>Generate report</button>
          </div>
        </div>
        <article className="nexops-module-card wide">
          <p className="eyebrow">Staff filters</p>
          <div className="nexops-request-builder-grid">
            <label className="nexops-field">
              <span>Client</span>
              <select value={clientFilterId} onChange={(event) => setClientFilterId(event.target.value)}>
                <option value="">All clients</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>{clientDisplayName(client)}</option>
                ))}
              </select>
            </label>
            <label className="nexops-field">
              <span>From</span>
              <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            </label>
            <label className="nexops-field">
              <span>To</span>
              <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </label>
            <label className="nexops-field">
              <span>Report type</span>
              <select value={reportKind} onChange={(event) => setReportKind(event.target.value as "field_report" | "ai_recap")}>
                <option value="field_report">Field report</option>
                <option value="ai_recap">AI recap</option>
              </select>
            </label>
            <label className="nexops-field">
              <span>Report template</span>
              <select
                value={selectedReportTemplateId}
                onChange={(event) => {
                  const nextTemplateId = event.target.value;
                  const nextTemplate = reportTemplates.find((entry) => entry.id === nextTemplateId);
                  setSelectedReportTemplateId(nextTemplateId);
                  if (nextTemplate) {
                    setReportTitle(nextTemplate.defaultReportTitle);
                    setWatermarkEnabled(nextTemplate.watermarkByDefault);
                  }
                }}
              >
                <option value="">No template</option>
                {reportTemplates.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}
              </select>
            </label>
          </div>
        </article>
        <div className="nexops-two-column">
          <section className="nexops-module-page">
            <article className="nexops-module-card wide">
              <p className="eyebrow">Generate</p>
              <h2>{report?.title ?? "Create the visit report from the completed checklist"}</h2>
              <label className="nexops-field">
                <span>Report title</span>
                <input value={reportTitle} onChange={(event) => setReportTitle(event.target.value)} />
              </label>
              <div className="nexops-inline-actions">
                {textSnippets.map((snippet) => (
                  <button
                    key={snippet.id}
                    type="button"
                    className={selectedSnippetIds.includes(snippet.id) ? "active" : "nexops-link-button"}
                    onClick={() => toggleSnippetSelection(snippet.id)}
                  >
                    {snippet.label}
                  </button>
                ))}
              </div>
              <label className="nexops-check-field inline">
                <input type="checkbox" checked={watermarkEnabled} onChange={(event) => setWatermarkEnabled(event.target.checked)} />
                Add tenant watermark on export
              </label>
              <p>{report ? `${report.status} report ${report.id} ready for the closeout receipt rail.` : "Use the current context and checklist to generate the report PDF."}</p>
              <div className="nexops-inline-actions">
                {reportUrl ? <a className="nexops-link-button" href={reportUrl} target="_blank" rel="noreferrer">Open latest PDF</a> : null}
              </div>
            </article>
          </section>
          <section className="nexops-module-page">
            <article className="nexops-module-card wide">
              <p className="eyebrow">Recent reports</p>
              <ul className="nexops-record-list">
                {reports.map((entry) => (
                  <li key={entry.id}>
                    <div>
                      <strong>{entry.title}</strong>
                      <small>{entry.visitId ? `Visit ${entry.visitId}` : `Job ${entry.jobId}`} - {entry.kind === "ai_recap" ? "AI recap" : "Field report"}</small>
                    </div>
                    <mark>{entry.status}</mark>
                    <a className="nexops-link-button" href={`/api/fielddocs/reports/${encodeURIComponent(entry.id)}/pdf?tenantId=${encodeURIComponent(operatorContext.tenantId)}`} target="_blank" rel="noreferrer">PDF</a>
                  </li>
                ))}
                {!reports.length ? (
                  <li>
                    <div>
                      <strong>No reports in this context yet</strong>
                      <small>Complete a checklist, then generate the branded PDF here.</small>
                    </div>
                    <mark>pending</mark>
                    <span />
                  </li>
                ) : null}
              </ul>
            </article>
          </section>
        </div>
      </section>
    );
}
