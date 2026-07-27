import React from "react";
import { useAuthSession } from "../../../shared/auth/AuthSessionProvider";
import { useNexiChat } from "../hooks/useNexiChat";
import "../styles/nexi.css";
import { mediaDownloadUrl, mediaUrl, sourceIsPhoto } from "../utils/sourceMedia";
import { MediaLightbox } from "./MediaLightbox";

export function NexiChatFeature(props: { tenantId: string }): React.ReactElement {
  const { signOut, user } = useAuthSession();
  const {
    activeMedia,
    draft,
    health,
    messages,
    sendMessage,
    setActiveMedia,
    setDraft,
    working
  } = useNexiChat({
    tenantId: props.tenantId,
    user
  });

  return (
    <>
      <section className="nexi-chat">
        <header className="nexi-chat__topbar">
          <div>
            <p className="ui-eyebrow">Tenant operations</p>
            <h1>Nexi Job Desk</h1>
            <p className="nexi-chat__signed-in">{user?.email ?? "Firebase operator"}</p>
          </div>
          <div className="nexi-chat__top-actions">
            <span className={`nexi-chat__health nexi-chat__health--${health}`} aria-label={`Health ${health}`} />
            <button className="nexi-chat__sign-out" type="button" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        </header>

        <div className="nexi-chat__thread" aria-live="polite">
          {messages.map((message) => (
            <article className={`nexi-chat__bubble nexi-chat__bubble--${message.role}`} key={message.id}>
              <p>{message.text}</p>
              {message.sources.length > 0 ? (
                <div className="nexi-chat__sources">
                  {message.sources.map((source) => (
                    <span
                      className={`nexi-chat__source ${sourceIsPhoto(source) ? "nexi-chat__source--photo" : ""}`}
                      key={`${source.rail}:${source.ref}`}
                    >
                      {sourceIsPhoto(source) ? (
                        <button
                          aria-label={`Open full-size ${source.label}`}
                          className="nexi-chat__thumb-button"
                          type="button"
                          onClick={() => setActiveMedia(source)}
                        >
                          <img
                            className="nexi-chat__thumb"
                            src={mediaUrl(source)}
                            alt={source.label}
                            loading="lazy"
                          />
                        </button>
                      ) : null}
                      <span>{source.label}</span>
                      {sourceIsPhoto(source) ? (
                        <a
                          className="nexi-chat__save-link"
                          href={mediaDownloadUrl(source)}
                          download={`companycam-${source.ref}.jpg`}
                        >
                          Save
                        </a>
                      ) : null}
                    </span>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
          {working ? <div className="nexi-chat__typing">Nexi is checking the rails...</div> : null}
        </div>

        <form
          className="nexi-chat__composer"
          onSubmit={(event) => {
            event.preventDefault();
            void sendMessage();
          }}
        >
          <input
            aria-label="Message Nexi"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask: What is on today's schedule?"
          />
          <button type="submit" disabled={working || !draft.trim()}>Send</button>
        </form>
      </section>
      {activeMedia ? <MediaLightbox source={activeMedia} onClose={() => setActiveMedia(null)} /> : null}
    </>
  );
}
