import React from "react";
import { clientDisplayName } from "../../../../nexopsShell/workspaceSupport";
import type { NexCamWorkspaceBindings } from "../../../../nexcam/areas/capture/hooks/useNexCamWorkspace";

export function MediaLibrarySurface(props: { workspace: NexCamWorkspaceBindings }): React.ReactElement {
  const {
    clientFilterId,
    clients,
    dateFrom,
    dateTo,
    includeTrashed,
    mediaHits,
    mediaQuery,
    recentMedia,
    refreshRecentMedia,
    renderMediaCard,
    searchMedia,
    setClientFilterId,
    setDateFrom,
    setDateTo,
    setIncludeTrashed,
    setMediaQuery
  } = props.workspace;

    return (
      <section className="nexops-module-page">
        <div className="nexops-page-heading">
          <div>
            <h1>Photos & Media</h1>
            <p>Visit-scoped uploads, AI tags, and generic content search over the native media rail.</p>
          </div>
          <div className="nexops-inline-actions">
            <input value={mediaQuery} onChange={(event) => setMediaQuery(event.target.value)} placeholder="Deborah Justice" />
            <button className="nexops-link-button" type="button" onClick={() => void refreshRecentMedia()}>Refresh recent</button>
            <button type="button" onClick={() => void searchMedia()}>Search media</button>
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
            <label className="nexops-check-field inline">
              <input type="checkbox" checked={includeTrashed} onChange={(event) => setIncludeTrashed(event.target.checked)} />
              Include tenant trash
            </label>
          </div>
        </article>
        <div className="nexops-two-column">
          <section className="nexops-module-page">
            <article className="nexops-module-card wide">
              <p className="eyebrow">Recent visit media</p>
              <h2>{recentMedia.length ? `${recentMedia.length} items in this context` : "No media in this context yet"}</h2>
              <p>Media stays grouped by property, job, and dated visit so one job never becomes a flat pile.</p>
            </article>
            <div className="nexcam-media-grid">
              {recentMedia.map((hit) => renderMediaCard(hit, `Recent ${hit.type}`))}
            </div>
          </section>
          <section className="nexops-module-page">
            <article className="nexops-module-card wide">
              <p className="eyebrow">Generic content search</p>
              <h2>{mediaHits.length ? `${mediaHits.length} match${mediaHits.length === 1 ? "" : "es"} for "${mediaQuery}"` : "Search by content, tag, or context"}</h2>
              <p>Search reads the same AI caption, AI tags, and manual tags Nexi can query conversationally later.</p>
            </article>
            <div className="nexcam-media-grid">
              {mediaHits.map((hit) => renderMediaCard(hit, "Search match"))}
              {!mediaHits.length && !recentMedia.length ? (
                <article className="nexops-module-card">
                  <p className="eyebrow">Unresolved queue</p>
                  <h2>No media loaded in this view yet</h2>
                  <p>Search a real client or visit after uploads populate the native media repository.</p>
                </article>
              ) : null}
            </div>
          </section>
        </div>
      </section>
    );
}
